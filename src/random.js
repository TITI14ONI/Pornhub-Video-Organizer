// Usage :
//   npm run random            -> une vidéo au hasard parmi celles que tu n'as pas encore regardées
//   npm run random -- --all   -> une vidéo au hasard parmi toutes (même déjà regardées)
//   --json                    -> sortie lisible par une machine (utilisé par l'application de bureau)
//   --loop                    -> enchaîne les tirages (utilisé par l'application de bureau)
//
// Pose deux questions : "Tu l'as regardée ?" puis "Ça te plaît ?".
// Les réponses sont enregistrées dans la vidéo : "vu" (true/false) et "plait" (true/false).
// Si "Ça te plaît ?" contredit le fichier où elle était rangée, elle est déplacée dans l'autre.
// Ton avis remplace celui du tri automatique ("auto": false) : la vidéo compte désormais dans tes avis donnés.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { launchOpera, navigateOperaPage } from "./opera.js";

const LIKED_FILE = "liked.json";
const DISLIKED_FILE = "disliked.json";

const { values } = parseArgs({
    options: {
        all: { type: "boolean", default: false },
        loop: { type: "boolean", default: false },
        json: { type: "boolean", default: false }
    }
});
const JSON_MODE = values.json;
let browser = null;
let operaPage = null;

const emit = event => process.stdout.write(JSON.stringify(event) + "\n");

function loadJson(file) {
    if (!fs.existsSync(file)) return [];
    try {
        const text = fs.readFileSync(file, "utf8").trim();
        if (!text) return [];
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error("le fichier doit contenir une liste");
        return data;
    } catch (error) {
        const message = `Impossible de lire ${file} : ${error.message}`;
        if (JSON_MODE) emit({ type: "log", level: "error", message });
        else console.error(message);
        process.exit(1);
    }
}

function saveJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

const store = {
    [LIKED_FILE]: loadJson(LIKED_FILE),
    [DISLIKED_FILE]: loadJson(DISLIKED_FILE)
};

const rl = readline.createInterface({
    input: process.stdin,
    output: JSON_MODE ? undefined : process.stdout
});

// true = oui, false = non, null = quitter
async function askYesNo(id, question) {
    if (JSON_MODE) emit({ type: "question", id, text: question });
    const prompt = JSON_MODE ? "" : `${question} (o = oui, n = non, q = quitter) `;

    while (true) {
        const answer = (await rl.question(prompt)).trim().toLowerCase();
        if (["o", "oui", "y"].includes(answer)) return true;
        if (["n", "non"].includes(answer)) return false;
        if (answer === "q") return null;
    }
}

function getPool(previousLink, unavailableLinks) {
    const candidates = [];
    for (const file of [LIKED_FILE, DISLIKED_FILE]) {
        for (const entry of store[file]) {
            // Une vidéo reste proposée tant que tu ne l'as pas regardée (vu absent ou "non")
            if ((values.all || entry.vu !== true) && !unavailableLinks.has(entry.lien)) candidates.push({ entry, file });
        }
    }

    return values.loop && previousLink
        ? candidates.filter(({ entry }) => entry.lien !== previousLink)
        : candidates;
}

function showEmptyMessage(hasAlternatives) {
    const message = hasAlternatives
        ? "Il n'y a pas d'autre vidéo à proposer pour le moment."
        : "Aucune vidéo à proposer : sauvegarde d'abord des vidéos, ou inclus celles que tu as déjà regardées.";
    if (JSON_MODE) {
        emit({ type: "empty", message });
    } else {
        console.log(message);
        console.log(`Lance d'abord "npm start" pour en sauvegarder, ou "npm run random -- --all" pour inclure aussi les vidéos que tu as déjà regardées.`);
    }
}

async function openVideoInOpera(url) {
    let target;
    try {
        target = new URL(url);
    } catch {
        throw new Error("Le lien de la vidéo est invalide.");
    }

    const validHost = target.hostname === "pornhub.com" || target.hostname.endsWith(".pornhub.com");
    const viewkey = target.searchParams.get("viewkey") || "";
    if (target.protocol !== "https:" || !validHost || target.pathname !== "/view_video.php" || !/^[a-z0-9]+$/i.test(viewkey)) {
        throw new Error("Ce lien n'est pas une vidéo Pornhub valide.");
    }

    if (!browser?.isConnected()) {
        const executablePath = process.env.OPERA_PATH || "";
        if (!executablePath || !fs.existsSync(executablePath)) {
            throw new Error("Opera GX est introuvable. Vérifie son emplacement dans les paramètres.");
        }
        if (JSON_MODE) emit({ type: "status", message: "Ouverture d'Opera GX…" });
        browser = await launchOpera({
            executablePath,
            userDataDir: process.env.OPERA_PROFILE_DIR || path.resolve("opera-profile")
        });
    }

    if (JSON_MODE) emit({ type: "status", message: "Préparation de l'onglet Opera GX…" });
    const pages = await browser.pages();
    operaPage = operaPage && !operaPage.isClosed()
        ? operaPage
        : pages.find(page => page.url() === "about:blank") || pages[0] || await browser.newPage();

    if (JSON_MODE) emit({ type: "status", message: "Ouverture de la vidéo dans Opera GX…" });
    const navigation = await navigateOperaPage(operaPage, target.href);
    if (navigation.timedOut) {
        if (JSON_MODE) {
            emit({
                type: "log",
                level: "warn",
                message: "Opera GX a commencé à ouvrir la vidéo, mais la page répond lentement. La session continue."
            });
        }
    }
    await operaPage.bringToFront();
}

try {
    let previousLink = "";
    const unavailableLinks = new Set();
    while (true) {
        const pool = getPool(previousLink, unavailableLinks);
        if (pool.length === 0) {
            if (unavailableLinks.size && getPool("", unavailableLinks).length === 0) {
                const message = "Opera GX n'a pas pu ouvrir les autres vidéos. Vérifie ta connexion puis réessaie.";
                if (JSON_MODE) emit({ type: "empty", message });
                else console.log(message);
            } else {
                showEmptyMessage(Boolean(previousLink && getPool("", unavailableLinks).length));
            }
            break;
        }

        const { entry, file: fromFile } = pool[Math.floor(Math.random() * pool.length)];
        if (values.loop) {
            try {
                await openVideoInOpera(entry.lien);
            } catch (error) {
                unavailableLinks.add(entry.lien);
                const message = `Impossible d'ouvrir « ${entry.titre} » dans Opera GX : ${error.message}. J'essaie une autre vidéo.`;
                if (JSON_MODE) emit({ type: "log", level: "warn", message });
                else console.warn(message);
                continue;
            }
        }

        if (JSON_MODE) {
            emit({ type: "pick", entry, from: fromFile, poolSize: pool.length });
        } else {
            console.log(`\n${entry.titre}`);
            console.log(`  👁️ ${entry.vue || "?"}   👍 ${entry.like || "?"}`);
            if (entry.chaine) console.log(`  📺 ${entry.chaine}`);
            if (entry.tag?.length) console.log(`  🏷️ ${entry.tag.join(", ")}`);
            console.log(`  ${entry.lien}`);
            console.log(`  (rangée dans ${fromFile}${entry.auto ? ", triée automatiquement" : ""})\n`);
        }

        const watched = await askYesNo("watched", "Tu l'as regardée ?");
        if (watched === null) break;

        const likes = await askYesNo("likes", "Ça te plaît ?");
        if (likes === null) break;

        entry.vu = watched;
        entry.plait = likes;
        entry.auto = false; // c'est maintenant ton avis, plus celui du tri automatique

        const targetFile = likes ? LIKED_FILE : DISLIKED_FILE;
        const moved = targetFile !== fromFile;

        if (moved) {
            store[fromFile] = store[fromFile].filter(item => item !== entry);
            store[targetFile].push(entry);
            saveJson(targetFile, store[targetFile]); // d'abord l'arrivée : en cas de coupure, la vidéo n'est jamais perdue
            saveJson(fromFile, store[fromFile]);
        } else {
            saveJson(targetFile, store[targetFile]);
        }

        const everything = [...store[LIKED_FILE], ...store[DISLIKED_FILE]];
        const manualTotal = everything.filter(item => !item.auto).length;
        const autoLeft = everything.length - manualTotal;
        previousLink = entry.lien;

        if (JSON_MODE) {
            emit({ type: "saved", moved, from: fromFile, to: targetFile, entry, manualTotal, autoLeft });
        } else if (moved) {
            console.log(`\nDéplacée de ${fromFile} vers ${targetFile}.`);
        } else {
            console.log(`\nEnregistré dans ${targetFile}.`);
        }
        if (!JSON_MODE) {
            console.log(`Sauvegarde mise à jour : tu as validé ${manualTotal} vidéo(s) toi-même (${autoLeft} encore triée(s) automatiquement).`);
        }

        if (!values.loop) break;
    }
} catch (error) {
    const message = `Erreur du mode hasard : ${error.message}`;
    if (JSON_MODE) emit({ type: "log", level: "error", message });
    else console.error(message);
    process.exitCode = 1;
} finally {
    rl.close();
    if (browser?.isConnected()) await browser.close().catch(error => {
        const message = `Impossible de fermer Opera GX : ${error.message}`;
        if (JSON_MODE) emit({ type: "log", level: "error", message });
        else console.error(message);
        process.exitCode = 1;
    });
}