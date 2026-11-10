// Usage :
//   node src/curate.js                               -> sans mot-clé (liste "hot" de Pornhub via Opera GX + VPN)
//   node src/curate.js "mots clés"                   -> avec une recherche
//   node src/curate.js --order viewed                -> sans mot-clé, trié : hot | viewed | rated | new
//   node src/curate.js --ask 20                      -> demande pour les 20 premières (all = toutes)
//   node src/curate.js --pages 5                     -> parcourt 5 pages de résultats
//   node src/curate.js --exclude "sfw,vlog"          -> ignore les titres/tags contenant ces mots
//   node src/curate.js --skip-vpn-check              -> mode Opera sans vérifier le pays (VPN système, ou site non restreint)
//   node src/curate.js --blocked-countries FR,BE     -> pays considérés comme "VPN inactif" (défaut : FR)
//   node src/curate.js "mots clés" --source pornhub  -> pornhub.js, sans navigateur (mots-clés obligatoires)
//   node src/curate.js --json                        -> sortie lisible par une machine (utilisé par l'application de bureau)
//
// Si Opera GX n'est pas trouvé : $env:OPERA_PATH="C:\chemin\vers\opera.exe"  (PowerShell)
//
// Sorties : liked.json et disliked.json, une liste d'objets :
//   { "titre", "vue", "like", "tag": [], "chaine", "lien", "duree", "miniature", "auto": false }
//
// Pour tirer une vidéo au hasard parmi celles sauvegardées : npm run random

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { PornHub } from "pornhub.js";
import { evaluateAfterNavigation, launchOpera } from "./opera.js";

const LIKED_FILE = "liked.json";
const DISLIKED_FILE = "disliked.json";
const PROFILE_DIR = path.resolve("opera-profile");
const ORDERS = { hot: "ht", viewed: "mv", rated: "tr", new: "cm" };

const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
        source: { type: "string", default: "opera" },
        pages: { type: "string", default: "3" },
        ask: { type: "string", default: "10" },
        order: { type: "string", default: "hot" },
        exclude: { type: "string", default: "sfw,vlog,vlogs" },
        "blocked-countries": { type: "string", default: "FR" },
        "skip-vpn-check": { type: "boolean", default: false },
        json: { type: "boolean", default: false }
    }
});

const JSON_MODE = values.json;
const query = positionals.join(" ").trim();
const maxPages = Math.max(1, Number(values.pages) || 3);
const askLimit = values.ask === "all" ? Infinity : Math.max(1, Number(values.ask) || 10);
const excluded = new Set(values.exclude.toLowerCase().split(",").map(w => w.trim()).filter(Boolean));

// Pays pour lesquels on considère que le VPN n'est pas actif (vérifié au démarrage en mode Opera)
const blockedCountries = new Set(
    values["blocked-countries"].toUpperCase().split(",").map(c => c.trim()).filter(Boolean)
);

class StopRequested extends Error {}

/* ========== SORTIE : texte (terminal) ou JSON (application) ========== */

const emit = event => process.stdout.write(JSON.stringify(event) + "\n");

function say(message, level = "info") {
    if (JSON_MODE) emit({ type: "log", level, message });
    else if (level === "error") console.error(message);
    else console.log(message);
}

// Étape en cours (affichée par l'application ; ignorée en mode texte)
function status(message) {
    if (JSON_MODE) emit({ type: "status", message });
}

// Question avec plusieurs choix (ex. VPN). En mode texte : invite classique.
async function ask({ id, message, choices, textPrompt }) {
    if (JSON_MODE) {
        emit({ type: "prompt", id, message, choices });
        return (await rl.question("")).trim().toLowerCase();
    }
    say(message);
    return (await rl.question(textPrompt)).trim().toLowerCase();
}

// Ignore les vidéos dont le titre ou un tag contient un mot exclu (ex. "vlog", "sfw")
function isExcluded(video) {
    const words = `${video.titre} ${video.tag.join(" ")}`.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    return words.some(word => excluded.has(word));
}

if (values.source === "pornhub" && !query) {
    say("Avec --source pornhub, il faut des mots-clés. Sans mot-clé, utilise la source par défaut (Opera) ou ajoute un mot-clé.", "error");
    process.exit(1);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: JSON_MODE ? undefined : process.stdout
});

/* ========== SOURCE : OPERA GX (via le VPN du navigateur) ========== */

let browser = null;
let listPage = null;   // onglet des résultats
let detailPage = null; // onglet des fiches vidéo (tags, likes...)

function findOperaPath() {
    if (process.env.OPERA_PATH) return process.env.OPERA_PATH;
    const local = process.env.LOCALAPPDATA || "";
    const candidates = [
        path.join(local, "Programs", "Opera GX", "opera.exe"),
        path.join(local, "Programs", "Opera GX", "launcher.exe"),
        "C:\\Program Files\\Opera GX\\opera.exe"
    ];
    return candidates.find(p => fs.existsSync(p)) ?? null;
}

// ERR_ABORTED = navigation interrompue (ex. pages de démarrage d'Opera) : on réessaie
async function safeGoto(page, url, options = {}) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000, ...options });
            return;
        } catch (error) {
            lastError = error;
            if (!/ERR_ABORTED|ERR_NETWORK_CHANGED|detached/i.test(error.message)) throw error;
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }
    throw lastError;
}

async function currentCountry() {
    const services = [
        ["https://api.country.is", text => { try { return JSON.parse(text).country; } catch { return ""; } }],
        ["https://ipinfo.io/country", text => text]
    ];
    const problems = [];

    for (const [url, parse] of services) {
        const host = new URL(url).hostname;
        try {
            await safeGoto(listPage, url, { timeout: 20000 });
            const text = await evaluateAfterNavigation(listPage, () => document.body.innerText.trim());
            const country = String(parse(text)).trim();
            if (/^[A-Z]{2}$/.test(country)) return country;
            problems.push(`${host} : réponse inattendue`);
        } catch (error) {
            problems.push(`${host} : ${error.message}`);
        }
    }

    say(`Vérification du pays impossible (${problems.join(" ; ")})`, "warn");
    return null;
}

async function startOpera() {
    status("Ouverture d'Opera GX…");
    const executablePath = findOperaPath();
    if (!executablePath || !fs.existsSync(executablePath)) {
        throw new Error('Opera GX introuvable. Définis son chemin : $env:OPERA_PATH="C:\\...\\Opera GX\\opera.exe"');
    }

    browser = await launchOpera({
        executablePath,
        userDataDir: PROFILE_DIR // profil dédié : le réglage du VPN y est conservé d'un lancement à l'autre
    });

    // Onglet dédié : les onglets de démarrage d'Opera (premier lancement) restent à part
    listPage = await browser.newPage();
    await listPage.bringToFront();

    // Vérifie que le VPN est actif : on ne veut pas sortir par un pays où le site est restreint
    while (!values["skip-vpn-check"]) {
        status("Vérification du VPN…");
        const country = await currentCountry();
        say(`Pays détecté par le navigateur : ${country ?? "inconnu"}`);

        if (country && !blockedCountries.has(country)) break;

        const message = !country
            ? "Je n'arrive pas à vérifier le pays. Dans la fenêtre Opera GX : termine l'installation de départ s'il y en a une, " +
              "puis vérifie que le VPN est activé et que tu peux ouvrir un site normalement."
            : `Le VPN ne semble pas actif : le navigateur sort par « ${country} ». Dans la fenêtre Opera GX : ` +
              "Paramètres → VPN → « Activer le VPN », puis choisis une région hors de ton pays (par exemple Amériques).";

        const answer = await ask({
            id: "vpn",
            message,
            choices: [
                { key: "", label: "Réessayer" },
                { key: "c", label: "Continuer quand même" },
                { key: "q", label: "Quitter" }
            ],
            textPrompt: "(Entrée = réessayer, c = continuer quand même, q = quitter) "
        });

        if (answer === "q") throw new StopRequested("Arrêt demandé.");
        if (answer === "c") break;
    }

    detailPage = await browser.newPage();
}

function listingUrl(page) {
    if (query) {
        return `https://www.pornhub.com/video/search?search=${encodeURIComponent(query)}&page=${page}`;
    }
    return `https://www.pornhub.com/video?o=${ORDERS[values.order] ?? "ht"}&page=${page}`;
}

async function fetchOpera(page) {
    await safeGoto(listPage, listingUrl(page));
    await listPage.waitForSelector('a[href*="view_video.php"]', { timeout: 15000 }).catch(() => {});

    return evaluateAfterNavigation(listPage, () => {
        const out = [];
        const seen = new Set();

        for (const a of document.querySelectorAll('a[href*="view_video.php?viewkey="]')) {
            const match = a.href.match(/viewkey=([a-z0-9]+)/i);
            if (!match || seen.has(match[1])) continue;

            const titre = (a.getAttribute("title") || a.textContent || "").trim();
            if (!titre) continue; // lien de miniature sans titre : on attend le lien titre

            seen.add(match[1]);
            const card = a.closest("li, .pcVideoListItem, .videoBox");
            const img = card?.querySelector("img");
            const thumb =
                img?.getAttribute("data-mediumthumb") ||
                img?.getAttribute("data-thumb_url") ||
                img?.getAttribute("data-src") ||
                img?.getAttribute("src") || "";

            out.push({
                titre,
                vue: card?.querySelector(".views var, .views")?.textContent.trim() || "",
                like: card?.querySelector(".rating-container .value, .value")?.textContent.trim() || "",
                tag: [],
                chaine: card?.querySelector(".usernameWrap a, .usernameBadgesWrapper a")?.textContent.trim() || "",
                lien: "https://www.pornhub.com/view_video.php?viewkey=" + match[1],
                duree: card?.querySelector(".duration")?.textContent.trim() || "",
                miniature: thumb.startsWith("https://") ? thumb : ""
            });
        }
        return out;
    });
}

// Ouvre la fiche de la vidéo pour récupérer les tags (et vues/likes/chaîne plus précis)
async function enrich(video) {
    if (!detailPage) return video;

    try {
        try {
            await safeGoto(detailPage, video.lien, { timeout: 20000 });
        } catch (error) {
            // Page lente (publicités...) : le contenu utile est souvent déjà là, on tente de le lire quand même
            if (!/timeout/i.test(error.message)) throw error;
        }
        await detailPage.waitForSelector("h1, .title", { timeout: 4000 }).catch(() => {});

        const d = await evaluateAfterNavigation(detailPage, () => {
            const text = selector => document.querySelector(selector)?.textContent.trim() || "";
            const list = selector =>
                [...document.querySelectorAll(selector)].map(a => a.textContent.trim()).filter(Boolean);
            const first = selectors => {
                for (const selector of selectors) {
                    const value = document.querySelector(selector)?.textContent.trim();
                    if (value) return value;
                }
                return "";
            };

            const likeRaw = first([".ratingInfo .percent", ".percent", ".ratingPercent", "[class*='percent']"]);

            return {
                chaine: first([
                    ".video-info-row .usernameWrap a",
                    ".userInfo .usernameWrap a",
                    ".usernameBadgesWrapper a",
                    ".userInfoContainer a"
                ]),
                vue: text(".views .count") || text(".views"),
                like: (likeRaw.match(/\d{1,3}\s*%/) || [""])[0].replace(/\s/g, ""),
                tag: [...list(".categoriesWrapper a"), ...list(".tagsWrapper a")]
            };
        });

        const tags = [...new Set(d.tag.filter(t => t.length > 1 && !/^suggest$/i.test(t)))];
        return {
            ...video,
            vue: d.vue || video.vue,
            like: d.like || video.like,
            chaine: d.chaine || video.chaine,
            tag: tags
        };
    } catch (error) {
        say(`Fiche vidéo illisible (${error.message}) : j'utilise les infos de la liste.`, "warn");
        return video;
    }
}

/* ========== AUTRES SOURCES (sans navigateur) ========== */

const phClient = new PornHub();

async function fetchPornhubJs(page) {
    const res = await phClient.searchVideo(query, { page });
    const list = Array.isArray(res?.data) ? res.data : [];
    return list.map(v => ({
        titre: v.title || "Sans titre",
        vue: v.views || "",
        like: "",
        tag: [],
        chaine: "",
        lien: v.url || "",
        duree: v.duration || "",
        miniature: String(v.thumb || v.default_thumb || "").startsWith("https://") ? (v.thumb || v.default_thumb) : ""
    }));
}

const fetchPage =
    values.source === "pornhub" ? fetchPornhubJs :
    fetchOpera;

/* ========== FICHIERS JSON ========== */

function loadJson(file) {
    if (!fs.existsSync(file)) return [];
    try {
        const text = fs.readFileSync(file, "utf8").trim();
        if (!text) return [];
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error("le fichier doit contenir une liste");
        return data;
    } catch (error) {
        // On s'arrête plutôt que d'écraser un fichier abîmé
        say(`Impossible de lire ${file} : ${error.message}`, "error");
        process.exit(1);
    }
}

const store = {
    [LIKED_FILE]: loadJson(LIKED_FILE),
    [DISLIKED_FILE]: loadJson(DISLIKED_FILE)
};

function saveEntry(file, video, auto = false) {
    const entry = {
        titre: video.titre,
        vue: video.vue,
        like: video.like,
        tag: video.tag,
        chaine: video.chaine || "",
        lien: video.lien,
        auto
    };
    if (video.duree) entry.duree = video.duree;
    if (video.miniature) entry.miniature = video.miniature;

    store[file].push(entry);
    fs.writeFileSync(file, JSON.stringify(store[file], null, 2), "utf8");
}

function urlKey(url) {
    try {
        return new URL(url).searchParams.get("viewkey") || url;
    } catch {
        return url;
    }
}

const publicVideo = video => ({
    titre: video.titre,
    vue: video.vue,
    like: video.like,
    tag: video.tag,
    chaine: video.chaine || "",
    lien: video.lien,
    duree: video.duree || "",
    miniature: video.miniature || ""
});

/* ========== APPRENTISSAGE (mots des titres + tags + chaîne) ========== */
// Les entrées triées automatiquement ("auto": true) ne servent pas à l'apprentissage.

const tokenize = text =>
    text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]{3,}/g) ?? [];

const textOf = entry => `${entry.titre} ${(entry.tag ?? []).join(" ")} ${entry.chaine ?? ""}`;

const model = {
    liked: new Map(),
    disliked: new Map(),
    nLiked: 0,
    nDisliked: 0,
    likedTotal: 0,
    dislikedTotal: 0,
    vocab: new Set()
};

function learn(entry, isLiked) {
    const bag = isLiked ? model.liked : model.disliked;
    for (const word of tokenize(textOf(entry))) {
        bag.set(word, (bag.get(word) ?? 0) + 1);
        model.vocab.add(word);
        if (isLiked) model.likedTotal++; else model.dislikedTotal++;
    }
    if (isLiked) model.nLiked++; else model.nDisliked++;
}

// score > 0 => plutôt aimé, score < 0 => plutôt pas aimé
function score(entry) {
    const V = model.vocab.size || 1;
    let s = Math.log((model.nLiked + 1) / (model.nDisliked + 1));
    for (const word of tokenize(textOf(entry))) {
        s += Math.log(((model.liked.get(word) ?? 0) + 1) / (model.likedTotal + V));
        s -= Math.log(((model.disliked.get(word) ?? 0) + 1) / (model.dislikedTotal + V));
    }
    return s;
}

/* ========== FLUX DES VIDÉOS ========== */

const known = new Set([...store[LIKED_FILE], ...store[DISLIKED_FILE]].map(e => urlKey(e.lien)));
store[LIKED_FILE].filter(e => !e.auto).forEach(e => learn(e, true));
store[DISLIKED_FILE].filter(e => !e.auto).forEach(e => learn(e, false));

// --ask est un objectif TOTAL : les vidéos que tu as déjà validées toi-même ("auto": false) comptent.
// On ne te demande donc ton avis que sur celles qui manquent pour atteindre l'objectif.
const manualBefore = [...store[LIKED_FILE], ...store[DISLIKED_FILE]].filter(e => !e.auto).length;
const askNeeded = askLimit === Infinity ? Infinity : Math.max(0, askLimit - manualBefore);

// Les vidéos nouvelles (ni déjà classées, ni exclues par le titre), page après page
async function* candidates() {
    for (let page = 1; page <= maxPages; page++) {
        status(`Lecture de la page ${page}…`);

        let videos;
        try {
            videos = await fetchPage(page);
        } catch (error) {
            throw new Error(`Erreur page ${page} : ${error.message}`, { cause: error });
        }

        if (videos.length === 0) {
            say("Plus de résultats (ou page inaccessible).", "warn");
            return;
        }

        for (const listed of videos) {
            if (!listed.lien) continue;

            const key = urlKey(listed.lien);
            if (known.has(key)) continue;
            known.add(key);

            if (isExcluded(listed)) continue;
            yield listed;
        }
    }
}

// Pendant que tu réponds pour une vidéo, la fiche de la suivante se charge déjà en arrière-plan
async function* enrichedStream() {
    const iterator = candidates();

    const first = await iterator.next();
    if (first.done) return;

    status("Lecture de la fiche vidéo…");
    let current = await enrich(first.value);

    while (true) {
        const next = await iterator.next();
        const prefetch = next.done ? null : enrich(next.value);

        yield current;

        if (!prefetch) return;
        current = await prefetch;
    }
}

/* ========== PROGRAMME ========== */

let askedThisRun = 0;
let likedCount = 0;
let dislikedCount = 0;
let autoCount = 0;
let stop = false;

if (JSON_MODE) {
    emit({
        type: "start",
        source: values.source,
        query,
        order: values.order,
        liked: store[LIKED_FILE].length,
        disliked: store[DISLIKED_FILE].length,
        askLimit: askLimit === Infinity ? null : askLimit,
        manualBefore,
        askNeeded: askNeeded === Infinity ? null : askNeeded,
        learned: model.nLiked + model.nDisliked
    });
} else {
    const searchLabel = query ? `"${query}"` : `(sans mot-clé, ordre : ${values.order})`;
    console.log(`Source : ${values.source} | recherche : ${searchLabel}`);
    console.log(`Déjà classées : ${store[LIKED_FILE].length} aimées, ${store[DISLIKED_FILE].length} refusées`);
    console.log(`Avis déjà donnés par toi : ${manualBefore} (objectif : ${askLimit === Infinity ? "tout valider" : askLimit})`);
    console.log(
        askNeeded === 0 ? "→ Objectif atteint : le tri sera automatique.\n" :
        askNeeded === Infinity ? "→ Ton avis sera demandé pour chaque vidéo.\n" :
        `→ Ton avis sera demandé pour ${askNeeded} nouvelle(s) vidéo(s).\n`
    );
}

try {
    if (values.source === "opera") await startOpera();

    for await (const video of enrichedStream()) {
        if (isExcluded(video)) continue;

        const canAutoSort = askedThisRun >= askNeeded && model.nLiked > 0 && model.nDisliked > 0;

        if (canAutoSort) {
            const isLiked = score(video) > 0;
            saveEntry(isLiked ? LIKED_FILE : DISLIKED_FILE, video, true);
            autoCount++;

            if (JSON_MODE) emit({ type: "auto", liked: isLiked, video: publicVideo(video), count: autoCount });
            else console.log(`${isLiked ? "👍 auto" : "👎 auto"}  ${video.titre}`);
            continue;
        }

        if (JSON_MODE) {
            emit({
                type: "ask",
                video: publicVideo(video),
                asked: askedThisRun,
                limit: askNeeded === Infinity ? null : askNeeded,
                target: askLimit === Infinity ? null : askLimit,
                manualBefore,
                // objectif atteint mais il manque encore au moins un 👍 ou un 👎 pour pouvoir apprendre
                needBoth: askedThisRun >= askNeeded,
                learned: model.nLiked + model.nDisliked
            });
        } else {
            console.log(`\n${video.titre}`);
            console.log(`  ⏱️ ${video.duree || "?"}   👁️ ${video.vue || "?"}   👍 ${video.like || "?"}`);
            if (video.chaine) console.log(`  📺 ${video.chaine}`);
            if (video.tag.length) console.log(`  🏷️ ${video.tag.join(", ")}`);
            console.log(`  ${video.lien}`);
            if (askedThisRun >= askNeeded) console.log("  (il me faut encore au moins un 👍 et un 👎 pour apprendre tes goûts)");
        }

        let answer;
        while (true) {
            answer = (await rl.question(JSON_MODE ? "" : "Ça te plaît ? (o = oui, n = non, s = passer, q = quitter) "))
                .trim().toLowerCase();
            if (["o", "oui", "y", "n", "non", "s", "q"].includes(answer)) break;
        }

        if (answer === "q") { stop = true; break; }
        if (answer === "s") continue;

        const isLiked = ["o", "oui", "y"].includes(answer);
        saveEntry(isLiked ? LIKED_FILE : DISLIKED_FILE, video);
        learn(video, isLiked);
        askedThisRun++;
        if (isLiked) likedCount++; else dislikedCount++;
    }
} catch (error) {
    if (error instanceof StopRequested) {
        stop = true;
        say(error.message);
    } else {
        say("Erreur : " + error.message, "error");
        process.exitCode = 1;
    }
} finally {
    rl.close();
    if (browser) await browser.close().catch(() => {});
}

if (JSON_MODE) {
    emit({
        type: "done",
        liked: likedCount,
        disliked: dislikedCount,
        auto: autoCount,
        stopped: stop,
        ok: process.exitCode === undefined || process.exitCode === 0,
        manualTotal: manualBefore + likedCount + dislikedCount
    });
} else {
    console.log(`\nTerminé : ${likedCount} aimées et ${dislikedCount} refusées par toi, ${autoCount} triées automatiquement.`);
    console.log(`Au total, tu as validé ${manualBefore + likedCount + dislikedCount} vidéo(s) toi-même.`);
    console.log(`Fichiers : ${LIKED_FILE} et ${DISLIKED_FILE}`);
}