"use strict";

const appApi = window.api || {};
const $ = (selector, root = document) => root.querySelector(selector);

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function button(label, className, onClick) {
    const node = el("button", "btn" + (className ? " " + className : ""), label);
    node.type = "button";
    if (onClick) node.addEventListener("click", onClick);
    return node;
}

const show = (node, visible) => node.classList.toggle("hidden", !visible);

let toastTimer = null;
function toast(text, isError = false) {
    const node = $("#toast");
    node.textContent = text;
    node.classList.toggle("error", isError);
    show(node, true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => show(node, false), 5000);
}

/* ========================================================================
   QUESTIONNAIRE : une seule définition, utilisée par l'assistant de première
   ouverture ET par la page Paramètres.
   ======================================================================== */

const isInt = (value, min, max) => {
    const n = Number(value);
    return String(value).trim() !== "" && Number.isInteger(n) && n >= min && n <= max;
};

const QUESTIONS = [
    {
        id: "adult", group: "base", type: "checkbox", label: "Contenu réservé aux adultes",
        text: "Je confirme avoir 18 ans ou plus (ou l'âge légal dans mon pays).",
        why: "L'application manipule des liens vers des sites pour adultes. Cette confirmation reste sur ton ordinateur.",
        validate: value => value === true || "Tu dois confirmer pour utiliser l'application."
    },
    {
        id: "source", group: "source", type: "choice", label: "Quelle source veux-tu utiliser ?",
        help: "Tu pourras changer cette préférence plus tard dans les paramètres.",
        why: "Opera GX fournit davantage d'informations et ouvre les vidéos directement dans son navigateur. L'autre source ne nécessite pas Opera GX, mais demande une recherche par mots-clés.",
        options: [
            ["auto", "Automatique (recommandé)", "L'application choisit selon les logiciels installés."],
            ["opera", "Pornhub via Opera GX", "Fonctionne sans mot-clé et récupère plus d'informations."],
            ["pornhub", "Pornhub via pornhub.js", "N'a pas besoin d'Opera GX; mots-clés nécessaires pour le tri."]
        ]
    },
    {
        id: "operaInstalled", group: "source", type: "choice", label: "Opera GX est-il installé ?",
        why: "Le mode hasard ouvre la vidéo tirée dans Opera GX. La source choisie pour le tri n'a pas d'effet sur cette option.",
        options: [
            ["yes", "Oui", "Je l'ai installé."],
            ["no", "Non", "Je ne l'ai pas sur cet ordinateur."]
        ]
    },
    {
        id: "operaPath", group: "source", type: "path", label: "Où se trouve Opera GX ?",
        help: "Le fichier à choisir s'appelle opera.exe. Il est en général dans : C:\\Users\\TonNom\\AppData\\Local\\Programs\\Opera GX",
        why: "L'application doit savoir quel programme ouvrir. « Détecter » le cherche automatiquement aux endroits habituels ; sinon utilise « Parcourir… ».",
        showIf: answers => answers.operaInstalled === "yes",
        validate: value => String(value).trim() !== "" || "Indique l'emplacement d'Opera GX, ou réponds « Non » à la question précédente."
    },
    {
        id: "restricted", group: "privacy", type: "choice", label: "Le site est-il restreint dans ton pays ?",
        showIf: answers => answers.source !== "pornhub" && answers.operaInstalled === "yes",
        help: "Si tu ne sais pas, choisis « Je ne sais pas » : l'application prendra l'option prudente.",
        why: "La question du VPN n'apparaît que si tu réponds oui ou si tu n'es pas sûr.",
        options: [
            ["yes", "Oui", "Le site est bloqué ou son contenu est limité."],
            ["no", "Non", "Le site fonctionne normalement."],
            ["unknown", "Je ne sais pas", "Je préfère que l'application vérifie le VPN par prudence."]
        ]
    },
    {
        id: "vpn", group: "privacy", type: "choice", label: "Quel VPN utilises-tu ?",
        showIf: answers => answers.source !== "pornhub" && answers.operaInstalled === "yes" && answers.restricted !== "no",
        help: "Si le site n'est pas restreint dans ton pays, cette question est masquée.",
        why: "Seul le VPN intégré à Opera GX peut être vérifié par l'application. Un VPN système est déjà actif indépendamment du navigateur.",
        options: [
            ["none", "Aucun VPN", "Je n'en utilise pas."],
            ["opera", "Le VPN intégré à Opera GX", "L'application vérifiera qu'il est actif avant de commencer."],
            ["system", "Un VPN pour tout l'ordinateur", "Il est déjà activé sur mon ordinateur."]
        ]
    },
    {
        id: "country", group: "privacy", type: "text", label: "Dans quel pays es-tu ?",
        showIf: answers => answers.source !== "pornhub" && answers.operaInstalled === "yes" && answers.restricted !== "no" && answers.vpn === "opera",
        help: "Entre le code à deux lettres de ton pays : FR, BE, CH, CA…",
        placeholder: "FR", maxlength: 2,
        why: "L'application compare ce pays avec celui détecté par Opera GX pour te prévenir si le VPN semble inactif.",
        validate: value => /^[A-Za-z]{2}$/.test(String(value).trim()) || "Entre un code à 2 lettres, par exemple FR."
    },
    {
        id: "pages", group: "sorting", type: "number", label: "Combien de pages parcourir par tri ?",
        help: "Une page contient environ 30 vidéos.",
        why: "Plus de pages = plus de vidéos à trier, mais un tri plus long. Tu pourras changer cette valeur à chaque lancement.",
        validate: value => isInt(value, 1, 50) || "Entre un nombre entre 1 et 50."
    },
    {
        id: "ask", group: "sorting", type: "text", label: "Combien de vidéos veux-tu valider avant le tri automatique ?",
        help: "Un nombre total (par exemple 10), ou « all » pour tout valider toi-même. Les vidéos que tu as déjà validées comptent : l'application ne te redemande ton avis que s'il en manque.", maxlength: 4,
        why: "Plus tu donnes d'avis, plus le tri automatique est fiable. 10 est un bon début ; 20 à 30 donne de meilleurs résultats. Une fois l'objectif atteint, chaque nouveau tri est automatique.",
        validate: value => String(value).trim().toLowerCase() === "all" || isInt(value, 1, 1000) || "Entre un nombre entre 1 et 1000, ou « all »."
    },
    {
        id: "order", group: "sorting", type: "choice", label: "Quel ordre utiliser sans mot-clé ?",
        why: "Sans mot-clé, l'application parcourt la liste générale du site. Cet ordre décide quelles vidéos arrivent en premier.",
        options: [
            ["hot", "Tendance", "Ce qui est populaire en ce moment."],
            ["viewed", "Les plus vues", ""],
            ["rated", "Les mieux notées", ""],
            ["new", "Les plus récentes", ""]
        ]
    },
    {
        id: "exclude", group: "sorting", type: "text", label: "Quels mots faut-il exclure ?",
        help: "Séparés par des virgules. Exemple : sfw,vlog,asmr",
        placeholder: "sfw,vlog,vlogs", maxlength: 200,
        why: "Les vidéos dont le titre ou un tag contient un de ces mots sont ignorées. Pratique pour écarter ce qui ne t'intéresse jamais."
    }
];

let config = null; // dernière configuration enregistrée
let draft = null;  // réponses en cours de modification

const visibleQuestions = answers => QUESTIONS.filter(q => !q.showIf || q.showIf(answers));

function validateQuestion(question, answers) {
    if (!question.validate) return "";
    const result = question.validate(answers[question.id], answers);
    return result === true ? "" : result;
}

// Convertit les réponses saisies (texte) en configuration propre
function toConfig(answers) {
    const ask = String(answers.ask).trim().toLowerCase();
    return {
        ...answers,
        country: String(answers.country || "").trim().toUpperCase(),
        pages: Number(answers.pages),
        ask: ask === "all" ? "all" : Number(ask),
        operaPath: String(answers.operaPath || "").trim(),
        exclude: String(answers.exclude || "")
    };
}

function buildField(question, hooks) {
    const wrap = el("div", "question");
    wrap.append(el("h3", "", question.label));
    if (question.help) wrap.append(el("p", "help", question.help));

    if (question.why) {
        const why = el("div", "why");
        why.append(el("b", "", "À quoi ça sert ? "), document.createTextNode(question.why));
        wrap.append(why);
    }

    if (question.type === "checkbox") {
        const label = el("label", "check");
        const input = el("input");
        input.type = "checkbox";
        input.checked = Boolean(draft[question.id]);
        input.addEventListener("change", () => { draft[question.id] = input.checked; });
        label.append(input, el("span", "", question.text));
        wrap.append(label);
    } else if (question.type === "choice") {
        const group = el("div", "choices");
        for (const [value, text, sub] of question.options) {
            const label = el("label", "choice");
            const input = el("input");
            input.type = "radio";
            input.name = question.id;
            input.checked = draft[question.id] === value;
            input.addEventListener("change", () => {
                draft[question.id] = value;
                hooks.rebuild();
            });
            const content = el("span");
            content.append(document.createTextNode(text));
            if (sub) content.append(el("span", "sub", sub));
            label.append(input, content);
            group.append(label);
        }
        wrap.append(group);
    } else {
        const row = el("div", "row");
        const input = el("input");
        input.type = question.type === "number" ? "number" : "text";
        if (question.type === "number") { input.min = "1"; input.max = "50"; }
        if (question.placeholder) input.placeholder = question.placeholder;
        if (question.maxlength) input.maxLength = question.maxlength;
        input.value = draft[question.id] ?? "";
        input.addEventListener("input", () => { draft[question.id] = input.value; });
        input.addEventListener("change", hooks.refresh);
        row.append(input);

        if (question.type === "path") {
            const note = el("span", "help");
            const setPath = value => { input.value = value; draft[question.id] = value; hooks.refresh(); };
            row.append(
                button("Parcourir…", "secondary small", async () => {
                    const chosen = await appApi.pickOpera();
                    if (chosen) { setPath(chosen); note.textContent = ""; }
                }),
                button("Détecter", "secondary small", async () => {
                    const found = await appApi.detectOpera();
                    if (found) { setPath(found); note.textContent = "Trouvé ✓"; }
                    else note.textContent = "Opera GX n'a pas été trouvé.";
                }),
                note
            );
        }
        wrap.append(row);
    }
    return wrap;
}

// Explique ce que l'application va faire avec les réponses
async function renderPlan(container) {
    const plan = await appApi.describePlan(toConfig(draft));
    container.replaceChildren(el("div", "plan-title", "➜ " + plan.title));

    const list = el("ul");
    for (const line of plan.lines) list.append(el("li", "", line));
    container.append(list);

    for (const warning of plan.warnings) container.append(el("div", "plan-warn", "⚠️ " + warning));
}

/* ----- Assistant de première ouverture ----- */

function introPage() {
    const wrap = el("div");
    wrap.append(el("h1", "", "Bienvenue 👋"));
    wrap.append(el("p", "muted", "Pornhub Video Organizer t'aide à trier des vidéos sans rien stocker. Voici comment ça marche :"));

    const items = [
        ["🔎", "L'application récupère des listes de vidéos (titre, chaîne, tags, lien)."],
        ["👍", "Tu réponds 👍 ou 👎 aux premières. Elle apprend ce que tu aimes."],
        ["🤖", "Le reste est classé automatiquement dans « Aimées » et « Refusées »."],
        ["🔒", "Rien n'est téléchargé : seuls des liens et des infos sont enregistrés, sur ton ordinateur."]
    ];
    const list = el("ul", "intro-list");
    for (const [emoji, text] of items) {
        const li = el("li");
        li.append(el("span", "emoji", emoji), el("span", "", text));
        list.append(li);
    }
    wrap.append(list);
    wrap.append(el("p", "help", "Les quelques questions suivantes servent à adapter l'application à ton installation (VPN, navigateur…). Tu pourras tout modifier plus tard dans les paramètres."));
    return wrap;
}

async function summaryPage() {
    const wrap = el("div");
    wrap.append(el("h1", "", "C'est presque fini ✅"));
    wrap.append(el("p", "muted", "Voici ce que l'application va faire d'après tes réponses :"));
    const box = el("div", "plan-box");
    wrap.append(box);
    await renderPlan(box);
    wrap.append(el("p", "help", "Tu peux changer tout ça à tout moment dans « Paramètres »."));
    return wrap;
}

function showWizard() {
    setMode("wizard");
    let index = 0;

    const pages = () => [
        { kind: "intro" },
        ...visibleQuestions(draft).map(question => ({ kind: "question", question })),
        { kind: "summary" }
    ];

    async function render() {
        const list = pages();
        index = Math.min(index, list.length - 1);
        const page = list[index];
        const questionCount = list.length - 2;

        $("#wizard-bar").style.width = `${(index / (list.length - 1)) * 100}%`;
        $("#wizard-error").textContent = "";
        $("#wizard-step").textContent =
            page.kind === "question" ? `Question ${index} sur ${questionCount}` :
            page.kind === "summary" ? "Récapitulatif" : "";

        const body = $("#wizard-body");
        if (page.kind === "intro") body.replaceChildren(introPage());
        else if (page.kind === "summary") body.replaceChildren(await summaryPage());
        else body.replaceChildren(buildField(page.question, { rebuild: () => {}, refresh: () => {} }));

        $("#wizard-back").disabled = index === 0;
        $("#wizard-next").textContent =
            page.kind === "intro" ? "Commencer" :
            page.kind === "summary" ? "Terminer et ouvrir l'application" : "Suivant";
    }

    $("#wizard-back").onclick = () => {
        index = Math.max(0, index - 1);
        render();
    };

    $("#wizard-next").onclick = async () => {
        const list = pages();
        const page = list[index];

        if (page.kind === "question") {
            const error = validateQuestion(page.question, draft);
            if (error) { $("#wizard-error").textContent = error; return; }
        }

        if (page.kind === "summary") {
            config = await appApi.saveConfig({ ...toConfig(draft), setupDone: true });
            enterApp();
            return;
        }

        index++;
        render();
    };

    render();
}

/* ----- Page Paramètres ----- */

async function renderSettings() {
    draft = { ...config };
    const body = $("#settings-body");
    $("#settings-status").textContent = "";
    $("#settings-datapath").textContent = await appApi.getDataPath();

    const refresh = () => renderPlan($("#settings-plan"));
    const build = () => {
        const visible = visibleQuestions(draft);
        const groups = [
            ["base", "Utilisation"],
            ["source", "Source et navigateur"],
            ["privacy", "Accès et VPN"],
            ["sorting", "Préférences de tri"]
        ];
        body.replaceChildren(...groups.flatMap(([id, title]) => {
            const questions = visible.filter(question => question.group === id);
            if (!questions.length) return [];

            const section = el("section", "settings-section");
            section.append(el("h3", "", title));
            for (const question of questions) {
                section.append(buildField(question, {
                    rebuild: () => { build(); refresh(); },
                    refresh
                }));
            }
            return [section];
        }));
    };
    build();
    refresh();
}

$("#settings-save").addEventListener("click", async () => {
    const status = $("#settings-status");
    for (const question of visibleQuestions(draft)) {
        const error = validateQuestion(question, draft);
        if (error) {
            status.className = "status error";
            status.textContent = `${question.label} — ${error}`;
            return;
        }
    }
    config = await appApi.saveConfig(toConfig(draft));
    status.className = "status ok";
    status.textContent = "Enregistré ✓";
    fillSortForm();
});

$("#settings-redo").addEventListener("click", () => {
    draft = { ...config };
    showWizard();
});

$("#settings-folder").addEventListener("click", () => appApi.openDataFolder());
$("#settings-import").addEventListener("click", () => importFromFiles());

/* ========================================================================
   FICHES VIDÉO
   ======================================================================== */

function thumbElement(url) {
    const box = el("div", "thumb", "🎬");
    if (url) {
        appApi.getThumb(url).then(dataUrl => {
            if (!dataUrl) return;
            const img = el("img");
            img.alt = "";
            img.src = dataUrl;
            box.replaceChildren(img);
        });
    }
    return box;
}

async function openVideo(link) {
    try {
        const result = await appApi.openLink(link);
        if (!result.ok) toast(result.error, true);
    } catch (error) {
        toast(`Impossible d'ouvrir la vidéo : ${error.message}`, true);
    }
}

// buttons : boutons supplémentaires à côté de « Ouvrir la vidéo »
function videoCard(video, { large = false, buttons = [] } = {}) {
    const card = el("div", "vcard" + (large ? " large" : ""));
    card.append(thumbElement(video.miniature));

    const body = el("div", "vbody");
    body.append(el("div", "vtitle", video.titre || "Sans titre"));

    const chips = el("div", "chips");
    const chipData = [
        ["⏱️", video.duree], ["👁️", video.vue], ["👍", video.like],
        ["✅", video.vu === true ? "vue" : ""], ["🤖", video.auto ? "triée automatiquement" : ""]
    ];
    for (const [icon, value] of chipData) if (value) chips.append(el("span", "chip", `${icon} ${value}`));
    if (chips.children.length) body.append(chips);

    if (video.chaine) body.append(el("div", "vchannel", "📺 " + video.chaine));

    if (Array.isArray(video.tag) && video.tag.length) {
        const tags = el("div", "tags");
        for (const tag of video.tag.slice(0, 12)) tags.append(el("span", "tag", tag));
        body.append(tags);
    }

    const actions = el("div", "vactions");
    actions.append(button("Ouvrir la vidéo ↗", "secondary small", () => openVideo(video.lien)), ...buttons);
    body.append(actions);

    card.append(body);
    return card;
}

/* ========================================================================
   LANCEMENT DES PROGRAMMES (tri et hasard)
   ======================================================================== */

const SOURCES = { opera: "Pornhub (via Opera GX)", pornhub: "Pornhub (pornhub.js)" };

let run = null; // { kind, awaiting, done, stopping, ... }

function setBusy(busy) {
    $("#sort-start").disabled = busy;
    $("#random-start").disabled = busy;
    show($("#sort-stop"), busy);
    show($("#random-stop"), busy);
}

function setStatus(kind, text, isError = false) {
    const node = $(`#${kind}-status`);
    node.textContent = text;
    node.classList.toggle("error", isError);
}

function addLog(kind, event) {
    const line = el("div", event.level === "error" ? "error" : event.level === "warn" ? "warn" : "", event.message);
    const log = $(`#${kind}-log`);
    log.append(line);
    log.scrollTop = log.scrollHeight;
}

/* ----- Trier ----- */

const sortUI = {
    setup: $("#sort-setup"), run: $("#sort-run"), progress: $("#sort-progress"), warnings: $("#sort-warnings"),
    notice: $("#sort-notice"), card: $("#sort-card"), summary: $("#sort-summary"), auto: $("#sort-auto"), log: $("#sort-log")
};

function resetSortUI() {
    sortUI.warnings.replaceChildren();
    sortUI.card.replaceChildren();
    sortUI.summary.replaceChildren();
    sortUI.auto.replaceChildren();
    sortUI.log.replaceChildren();
    for (const node of [sortUI.progress, sortUI.notice, sortUI.summary, sortUI.auto]) show(node, false);
    $("#sort-run .details").open = false;
}

async function startSort() {
    const request = {
        kind: "curate",
        query: $("#sort-query").value,
        order: $("#sort-order").value,
        pages: $("#sort-pages").value,
        ask: $("#sort-ask").value.trim().toLowerCase()
    };

    resetSortUI();
    run = { kind: "sort", awaiting: null, done: false, stopping: false, liked: 0, disliked: 0, asked: 0, limit: null, auto: 0, autoLiked: 0, autoDisliked: 0, target: null, manualBefore: 0, askNeeded: null, needBoth: false };
    show(sortUI.setup, false);
    show(sortUI.run, true);
    setBusy(true);
    setStatus("sort", "Démarrage…");

    const result = await appApi.start(request);
    if (!result.ok) {
        setStatus("sort", result.error, true);
        endSort({ title: "Impossible de lancer le tri", lines: [result.error], ok: false });
        return;
    }

    for (const warning of result.warnings) sortUI.warnings.append(el("div", "warning-line", "⚠️ " + warning));
    setStatus("sort", `Source : ${SOURCES[result.source] ?? result.source}…`);
}

function updateProgress() {
    show(sortUI.progress, true);
    const text = $(".progress-text", sortUI.progress);
    const bar = $(".progress-bar", sortUI.progress);

    // Avis donnés au total : ceux d'avant ce tri + ceux de maintenant
    const given = run.manualBefore + run.asked;

    if (run.auto > 0) {
        text.textContent = `Tri automatique : ${run.auto} vidéo(s) classée(s) (👍 ${run.autoLiked} · 👎 ${run.autoDisliked}).`;
        bar.style.width = "100%";
    } else if (run.askNeeded === 0 && !run.needBoth && run.asked === 0) {
        text.textContent = `Tu as déjà donné ton avis sur ${run.manualBefore} vidéo(s) (objectif : ${run.target}) : l'application trie directement, sans rien te demander.`;
        bar.style.width = "100%";
    } else if (run.target) {
        const before = run.manualBefore > 0 ? ` (dont ${run.manualBefore} déjà donnés avant)` : "";
        const note = run.needBoth
            ? " Il me faut encore au moins un 👍 et un 👎 pour apprendre tes goûts."
            : " L'application apprend tes goûts à chaque réponse.";
        text.textContent = `Tes avis : ${given} / ${run.target}${before}.${note}`;
        bar.style.width = `${Math.min(100, (given / run.target) * 100)}%`;
    } else {
        text.textContent = `Tes avis : ${given} vidéo(s) — tu valides tout toi-même.`;
        bar.style.width = "100%";
    }
}

function showAsk(event) {
    run.awaiting = "ask";
    run.asked = event.asked;
    run.limit = event.limit;
    run.target = event.target ?? run.target;
    run.manualBefore = event.manualBefore ?? run.manualBefore;
    run.needBoth = Boolean(event.needBoth);
    show(sortUI.notice, false);
    setStatus("sort", "À toi : cette vidéo te plaît-elle ?");
    updateProgress();

    const bar = el("div", "answer-bar");
    bar.append(
        button("👍 Ça me plaît", "big like", () => answerSort("o")),
        button("👎 Pas pour moi", "big dislike", () => answerSort("n")),
        button("Passer", "secondary", () => answerSort("s")),
        el("span", "keys", "Raccourcis : O ou → = 👍 · N ou ← = 👎 · S ou ↓ = passer")
    );
    sortUI.card.replaceChildren(videoCard(event.video, { large: true }), bar);
}

function answerSort(key) {
    if (!run || run.kind !== "sort" || run.awaiting !== "ask") return;
    run.awaiting = null;

    if (key === "o") run.liked++;
    if (key === "n") run.disliked++;
    if (key !== "s") run.asked++;

    appApi.sendInput(key);
    sortUI.card.replaceChildren(el("div", "skeleton", "Je prépare la vidéo suivante…"));
    setStatus("sort", "Lecture de la vidéo suivante…");
    updateProgress();
}

function showPrompt(event) {
    run.awaiting = "prompt";
    const box = sortUI.notice;
    box.replaceChildren(el("h3", "", event.id === "vpn" ? "🔒 Vérification du VPN" : "Question"), el("p", "", event.message));

    const actions = el("div", "actions");
    event.choices.forEach((choice, i) => {
        actions.append(button(choice.label, i === 0 ? "" : "secondary", () => {
            run.awaiting = null;
            show(box, false);
            setStatus("sort", "Nouvelle vérification…");
            appApi.sendInput(choice.key);
        }));
    });
    box.append(actions);
    show(box, true);
    setStatus("sort", "En attente de ta réponse…");
}

function addAutoItem(event) {
    show(sortUI.auto, true);
    if (!$("h3", sortUI.auto)) sortUI.auto.append(el("h3", "", "Classées automatiquement"), el("div", "auto-list"));

    const row = el("div", "auto-item");
    const title = el("span", "t link", event.video.titre);
    title.addEventListener("click", () => openVideo(event.video.lien));
    row.append(el("span", "icon", event.liked ? "👍" : "👎"), title);
    if (event.video.chaine) row.append(el("span", "c", event.video.chaine));

    const list = $(".auto-list", sortUI.auto);
    list.prepend(row);
    while (list.children.length > 40) list.lastChild.remove();
}

function endSort({ title, lines, ok }) {
    run.done = true;
    setBusy(false);
    run.awaiting = null;
    sortUI.card.replaceChildren();
    show(sortUI.notice, false);

    sortUI.summary.className = "summary-box";
    sortUI.summary.style.borderColor = ok ? "" : "var(--error)";
    sortUI.summary.replaceChildren(el("h3", "", title));
    for (const line of lines) sortUI.summary.append(el("p", "", line));

    const actions = el("div", "actions");
    actions.append(
        button("🎯 Nouveau tri", "", () => { show(sortUI.run, false); show(sortUI.setup, true); }),
        button("📚 Voir la bibliothèque", "secondary", () => showView("library"))
    );
    sortUI.summary.append(actions);
    show(sortUI.summary, true);
    refreshManualCount();
}

function onSortEvent(event) {
    switch (event.type) {
        case "log":
            addLog("sort", event);
            if (event.level === "error") setStatus("sort", event.message, true);
            break;
        case "status":
            if (!run.awaiting) setStatus("sort", event.message);
            break;
        case "start":
            run.target = event.askLimit;
            run.manualBefore = event.manualBefore ?? 0;
            run.askNeeded = event.askNeeded;
            run.limit = event.askNeeded;
            updateProgress();
            break;
        case "prompt":
            showPrompt(event);
            break;
        case "ask":
            showAsk(event);
            break;
        case "auto":
            if (run.auto === 0) sortUI.card.replaceChildren(el("div", "skeleton", "🤖 Tri automatique en cours d'après tes réponses…"));
            run.auto++;
            if (event.liked) run.autoLiked++; else run.autoDisliked++;
            setStatus("sort", "Tri automatique en cours…");
            addAutoItem(event);
            updateProgress();
            break;
        case "done": {
            const total = event.liked + event.disliked + event.auto;
            const lines = total === 0
                ? ["Aucune nouvelle vidéo n'a été trouvée : elles sont peut-être déjà toutes classées, ou exclues par tes mots à exclure."]
                : [`Tes réponses : ${event.liked} 👍 · ${event.disliked} 👎.`, `Triées automatiquement : ${event.auto} (👍 ${run.autoLiked} · 👎 ${run.autoDisliked}).`];
            if (typeof event.manualTotal === "number") lines.push(`Au total, tu as maintenant validé ${event.manualTotal} vidéo(s) toi-même.`);
            const ok = event.ok !== false;
            if (!ok) lines.push("Une erreur a empêché le tri de se terminer normalement. Consulte les détails techniques.");
            endSort({
                title: event.stopped ? "Tri arrêté" : ok ? "Tri terminé 🎉" : "Tri terminé avec une erreur",
                lines,
                ok
            });
            setStatus("sort", ok ? "Terminé." : "Terminé avec une erreur.", !ok);
            if (!ok) $("#sort-run .details").open = true;
            break;
        }
    }
}

/* ----- Au hasard ----- */

const randomUI = {
    setup: $("#random-setup"), run: $("#random-run"), card: $("#random-card"),
    question: $("#random-question"), result: $("#random-result"), log: $("#random-log")
};

async function startRandom() {
    randomUI.card.replaceChildren();
    randomUI.log.replaceChildren();
    randomUI.question.replaceChildren();
    randomUI.result.replaceChildren();
    for (const node of [randomUI.question, randomUI.result]) show(node, false);

    run = { kind: "random", awaiting: null, done: false, stopping: false, answers: {}, from: "" };
    show(randomUI.setup, false);
    show(randomUI.run, true);
    setBusy(true);
    setStatus("random", "Tirage au sort…");

    const result = await appApi.start({ kind: "random", all: $("#random-all").checked, loop: true });
    if (!result.ok) {
        setStatus("random", result.error, true);
        endRandom(result.error, false);
    }
}

function endRandom(message, ok = true, extra = []) {
    run.done = true;
    run.awaiting = null;
    setBusy(false);
    show(randomUI.question, false);

    randomUI.result.className = "summary-box";
    randomUI.result.replaceChildren(el("p", "", message));
    const actions = el("div", "actions");
    actions.append(
        button("🎲 Une autre", "", () => startRandom()),
        button("Terminer", "secondary", () => { show(randomUI.run, false); show(randomUI.setup, true); }),
        ...extra
    );
    randomUI.result.append(actions);
    show(randomUI.result, true);
    setStatus("random", ok ? "Terminé." : "Terminé avec une erreur.", !ok);
    refreshManualCount();
}

function answerRandom(key) {
    if (!run || run.kind !== "random" || run.awaiting !== "question") return;
    run.awaiting = null;
    run.answers[run.currentQuestion] = key === "o";
    appApi.sendInput(key);
    for (const node of $$buttons(randomUI.question)) node.disabled = true;
}

const $$buttons = root => [...root.querySelectorAll("button")];

const LIST_NAMES = { "liked.json": "Aimées", "disliked.json": "Refusées" };

function onRandomEvent(event) {
    switch (event.type) {
        case "status":
            setStatus("random", event.message);
            break;
        case "log":
            addLog("random", event);
            if (event.level === "error") setStatus("random", event.message, true);
            break;
        case "empty":
            endRandom(event.message);
            break;
        case "pick":
            run.from = event.from;
            run.answers = {};
            run.currentQuestion = null;
            show(randomUI.question, false);
            show(randomUI.result, false);
            setStatus("random", `Vidéo tirée parmi ${event.poolSize} (actuellement dans « ${LIST_NAMES[event.from]} »).`);
            randomUI.card.replaceChildren(videoCard(event.entry, { large: true }));
            break;
        case "question": {
            run.awaiting = "question";
            run.currentQuestion = event.id;
            randomUI.question.replaceChildren(el("div", "qtext", event.text));
            const row = el("div", "row");
            row.append(
                button("Oui", "big like", () => answerRandom("o")),
                button("Non", "big dislike", () => answerRandom("n")),
                el("span", "keys help", "Raccourcis : O / N")
            );
            randomUI.question.append(row);
            show(randomUI.question, true);
            break;
        }
        case "saved": {
            const to = LIST_NAMES[event.to];
            const recap = `Regardée : ${run.answers.watched ? "oui" : "non"} · Te plaît : ${run.answers.likes ? "oui" : "non"}.`;
            const where = event.moved ? `Déplacée dans « ${to} ».` : `Enregistrée dans « ${to} ».`;
            const total = typeof event.manualTotal === "number"
                ? ` Sauvegarde mise à jour : tu as maintenant validé ${event.manualTotal} vidéo(s) toi-même (${event.autoLeft} encore triée(s) automatiquement).`
                : "";
            setStatus("random", `${recap} ${where}${total} La vidéo suivante arrive dans le même onglet Opera GX…`);
            toast("Réponse enregistrée ✓");
            refreshManualCount();
            break;
        }
    }
}

/* ----- Événements communs ----- */

appApi.onEvent(event => {
    if (!run || run.done) return;
    if (run.kind === "sort") onSortEvent(event);
    else onRandomEvent(event);
});

appApi.onExit(code => {
    if (!run || run.done) return;

    if (run.stopping || code === 0) {
        if (run.kind === "sort") {
            endSort({ title: "Tri arrêté", lines: [`Tes réponses : ${run.liked} 👍 · ${run.disliked} 👎. Triées automatiquement : ${run.auto}.`], ok: true });
        } else {
            run.done = true;
            setBusy(false);
            show(randomUI.run, false);
            show(randomUI.setup, true);
        }
        return;
    }

    // Arrêt inattendu : on explique et on ouvre les détails techniques
    const message = `Le programme s'est arrêté de façon inattendue (code ${code}). Ouvre « Détails techniques » pour voir pourquoi.`;
    if (run.kind === "sort") {
        endSort({ title: "Le tri s'est arrêté", lines: [message], ok: false });
        $("#sort-run .details").open = true;
    } else {
        endRandom(message, false);
        $("#random-run .details").open = true;
    }
});

function stopRun() {
    if (!run || run.done) return;
    run.stopping = true;
    setStatus(run.kind, "Arrêt en cours…");
    appApi.stop();
}

$("#sort-start").addEventListener("click", startSort);
$("#random-start").addEventListener("click", startRandom);
$("#sort-stop").addEventListener("click", stopRun);
$("#random-stop").addEventListener("click", stopRun);

document.addEventListener("keydown", event => {
    if (!run || run.done || event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;

    const key = event.key.toLowerCase();

    if (run.kind === "sort" && run.awaiting === "ask" && !$("#view-sort").classList.contains("hidden")) {
        const map = { o: "o", arrowright: "o", n: "n", arrowleft: "n", s: "s", arrowdown: "s" };
        if (map[key]) { event.preventDefault(); answerSort(map[key]); }
    } else if (run.kind === "random" && run.awaiting === "question" && !$("#view-random").classList.contains("hidden")) {
        if (key === "o" || key === "n") { event.preventDefault(); answerRandom(key); }
    }
});

// Nombre de vidéos que tu as validées toi-même ("auto": false), dans les deux listes
let manualCount = 0;

function updateAskHint() {
    const node = $("#sort-ask-hint");
    const raw = $("#sort-ask").value.trim().toLowerCase();

    if (raw === "all") {
        node.textContent = `Tu valides tout toi-même : ton avis sera demandé pour chaque vidéo. (Tu en as déjà validé ${manualCount}.)`;
        return;
    }

    const target = Number(raw);
    if (!Number.isInteger(target) || target < 1) {
        node.textContent = "";
        return;
    }

    node.textContent = manualCount >= target
        ? `Tu as déjà donné ton avis sur ${manualCount} vidéo(s) (objectif : ${target}) : le tri sera automatique dès le lancement.`
        : `Tu as déjà donné ton avis sur ${manualCount} vidéo(s) : il te sera demandé ton avis sur ${target - manualCount} vidéo(s) de plus (objectif : ${target}).`;
}

async function refreshManualCount() {
    try {
        const lists = await appApi.getLibrary();
        manualCount = [...lists.liked, ...lists.disliked].filter(entry => !entry.auto).length;
    } catch { /* on garde l'ancienne valeur */ }
    updateAskHint();
}

function fillSortForm() {
    $("#sort-order").value = config.order;
    $("#sort-pages").value = config.pages;
    $("#sort-ask").value = config.ask;
    updateAskHint();
    refreshManualCount();
}

$("#sort-ask").addEventListener("input", updateAskHint);

/* ========================================================================
   BIBLIOTHÈQUE
   ======================================================================== */

const PAGE_SIZE = 48;
let library = { liked: [], disliked: [] };
let libraryTab = "liked";
let libraryLimit = PAGE_SIZE;

async function loadLibrary() {
    library = await appApi.getLibrary();
    manualCount = [...library.liked, ...library.disliked].filter(entry => !entry.auto).length;
    updateAskHint();
    renderLibrary();
}

async function updateEntry(action, entry) {
    const result = await appApi.updateEntry({ action, lien: entry.lien, from: libraryTab });
    if (!result.ok) { toast(result.error, true); return; }
    loadLibrary();
}

function libraryCard(entry) {
    const buttons = [
        button(libraryTab === "liked" ? "👎 Passer en Refusées" : "👍 Passer en Aimées", "secondary small", () => updateEntry("move", entry)),
        button("Supprimer", "secondary small danger", () => {
            if (confirm("Supprimer cette vidéo de la liste ? (Elle pourra être reproposée lors d'un prochain tri.)")) updateEntry("remove", entry);
        })
    ];
    return videoCard(entry, { buttons });
}

function renderLibrary() {
    $("#lib-tab-liked").textContent = `👍 Aimées (${library.liked.length})`;
    $("#lib-tab-disliked").textContent = `👎 Refusées (${library.disliked.length})`;
    for (const tab of document.querySelectorAll(".tab")) tab.classList.toggle("active", tab.dataset.tab === libraryTab);

    const filter = $("#library-filter").value.trim().toLowerCase();
    let items = [...library[libraryTab]].reverse(); // les plus récentes d'abord
    if ($("#library-sort").value === "old") items.reverse();
    if ($("#library-sort").value === "az") items.sort((a, b) => String(a.titre).localeCompare(String(b.titre), "fr"));

    if (filter) {
        items = items.filter(item => `${item.titre} ${item.chaine} ${(item.tag ?? []).join(" ")}`.toLowerCase().includes(filter));
    }

    const shown = items.slice(0, libraryLimit);
    $("#library-count").textContent =
        items.length === 0
            ? (library[libraryTab].length === 0 ? "Cette liste est vide. Lance un tri, ou importe tes anciennes sauvegardes." : "Aucun résultat pour ce filtre.")
            : `${items.length} vidéo(s)`;
    $("#library-list").replaceChildren(...shown.map(libraryCard));
    show($("#library-more"), items.length > shown.length);
}

for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => { libraryTab = tab.dataset.tab; libraryLimit = PAGE_SIZE; renderLibrary(); });
}
$("#library-filter").addEventListener("input", () => { libraryLimit = PAGE_SIZE; renderLibrary(); });
$("#library-sort").addEventListener("change", renderLibrary);
$("#library-more").addEventListener("click", () => { libraryLimit += PAGE_SIZE; renderLibrary(); });
$("#library-import").addEventListener("click", () => importFromFiles());

/* ----- Import d'anciennes sauvegardes ----- */

async function afterImport(result) {
    if (result.canceled) return;
    if (!result.ok) { toast(result.error, true); return; }

    toast(`${result.added} vidéo(s) importée(s) — ${result.skipped} ignorée(s) (déjà présentes ou invalides).`);
    config = await appApi.saveConfig({ importDismissed: true });
    for (const id of ["import-sort", "import-library"]) show($("#" + id), false);
    loadLibrary();
}

async function importFromFiles() {
    afterImport(await appApi.importFiles());
}

function renderImportBanner(container, found) {
    container.replaceChildren();

    const text = el("div", "grow");
    text.append(el("b", "", "📥 J'ai trouvé des sauvegardes existantes sur ton ordinateur"));
    for (const folder of found) {
        const row = el("div");
        row.append(
            el("div", "path", folder.dir),
            el("div", "help", `${folder.liked} aimée(s) · ${folder.disliked} refusée(s)`),
            button("Importer ce dossier", "small", async () => afterImport(await appApi.importDir(folder.dir)))
        );
        text.append(row);
    }

    container.append(
        text,
        button("Ignorer", "secondary small", async () => {
            config = await appApi.saveConfig({ importDismissed: true });
            for (const id of ["import-sort", "import-library"]) show($("#" + id), false);
        })
    );
    show(container, true);
}

async function checkImport() {
    if (config.importDismissed) return;
    const found = await appApi.detectSaves();
    if (!found.length) return;
    for (const id of ["import-sort", "import-library"]) renderImportBanner($("#" + id), found);
}

/* ========================================================================
   NAVIGATION ET DÉMARRAGE
   ======================================================================== */

function setMode(mode) {
    show($("#wizard"), mode === "wizard");
    show($("#shell"), mode === "app");
}

function showView(name) {
    for (const section of document.querySelectorAll(".view")) {
        section.classList.toggle("hidden", section.id !== "view-" + name);
    }
    for (const item of document.querySelectorAll("#nav button")) {
        item.classList.toggle("active", item.dataset.view === name);
    }
    if (name === "library") loadLibrary();
    if (name === "settings") renderSettings();
}

for (const item of document.querySelectorAll("#nav button")) {
    item.addEventListener("click", () => showView(item.dataset.view));
}

function enterApp() {
    setMode("app");
    fillSortForm();
    showView("sort");
    checkImport();
}

function showStartupFallback(message) {
    setMode("wizard");
    const body = $("#wizard-body");
    body.replaceChildren(
        el("div", "plan-box", ""),
        el("p", "error", message)
    );
    $("#wizard-back").disabled = true;
    $("#wizard-next").textContent = "Réessayer";
    $("#wizard-next").onclick = () => init();
}

async function init() {
    setMode("wizard");
    const body = $("#wizard-body");
    body.replaceChildren(el("div", "muted", "Chargement de l'application…"));
    $("#wizard-back").disabled = true;
    $("#wizard-next").textContent = "Chargement…";
    $("#wizard-next").disabled = true;

    try {
        if (!appApi) throw new Error("Le pont avec l'application est absent (preload non chargé).");

        config = await appApi.getConfig();
        draft = { ...config };

        if (config.setupDone) {
            enterApp();
            return;
        }

        // Première ouverture : on préremplit ce qu'on peut deviner
        const detected = await appApi.detectOpera();
        draft.operaInstalled = detected ? "yes" : "no";
        draft.operaPath = detected;

        const region = (navigator.language.split("-")[1] || "").toUpperCase();
        if (/^[A-Z]{2}$/.test(region)) draft.country = region;

        showWizard();
    } catch (error) {
        const message = "Erreur de démarrage : " + (error?.stack || error);
        showStartupFallback(message);
    } finally {
        const nextBtn = $("#wizard-next");
        if (!nextBtn.disabled || nextBtn.textContent === "Chargement…") nextBtn.disabled = false;
    }
}

setMode("wizard");
const bootCard = el("div", "wizard-card");
const bootBody = $("#wizard-body");
if (bootBody) {
    bootBody.replaceChildren(el("div", "muted", "Chargement de l'application…"));
}

init();