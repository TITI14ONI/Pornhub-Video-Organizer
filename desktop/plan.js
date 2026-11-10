// Logique "pure" de l'application : validation de la configuration et choix de la source / des options
// en fonction des réponses du questionnaire. Aucune dépendance à Electron (testable avec Node seul).

import fs from "node:fs";
import path from "node:path";

export const ORDERS = ["hot", "viewed", "rated", "new"];

export const DEFAULTS = {
    setupDone: false,
    adult: false,
    country: "",
    restricted: "unknown", // yes | no | unknown : le site est-il restreint dans ton pays ?
    vpn: "none",           // none | opera | system
    operaInstalled: "no",  // yes | no
    operaPath: "",
    source: "auto",        // auto | opera | pornhub
    pages: 3,
    ask: 10,               // nombre ou "all"
    order: "hot",
    exclude: "sfw,vlog,vlogs",
    importDismissed: false // a-t-on masqué la proposition d'importer d'anciennes sauvegardes ?
};

export function clampInt(value, min, max, fallback) {
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export function normalizeAsk(value, fallback) {
    if (value === "all") return "all";
    const n = clampInt(value, 1, 1000, null);
    if (n !== null) return String(n);
    return fallback === "all" ? "all" : String(clampInt(fallback, 1, 1000, 10));
}

// Ne garde que les clés connues, avec des valeurs valides
export function sanitizeConfig(input = {}) {
    const out = {};
    const oneOf = (key, allowed) => {
        if (allowed.includes(input[key])) out[key] = input[key];
    };

    if (typeof input.setupDone === "boolean") out.setupDone = input.setupDone;
    if (typeof input.adult === "boolean") out.adult = input.adult;
    if (typeof input.importDismissed === "boolean") out.importDismissed = input.importDismissed;
    if (typeof input.country === "string" && /^[A-Za-z]{0,2}$/.test(input.country.trim())) {
        out.country = input.country.trim().toUpperCase();
    }
    oneOf("restricted", ["yes", "no", "unknown"]);
    oneOf("vpn", ["none", "opera", "system"]);
    oneOf("operaInstalled", ["yes", "no"]);
    oneOf("source", ["auto", "opera", "pornhub"]);
    oneOf("order", ORDERS);
    if (typeof input.operaPath === "string") out.operaPath = input.operaPath.trim().slice(0, 500);

    const pages = clampInt(input.pages, 1, 50, null);
    if (pages !== null) out.pages = pages;

    if (input.ask === "all") out.ask = "all";
    else {
        const ask = clampInt(input.ask, 1, 1000, null);
        if (ask !== null) out.ask = ask;
    }

    if (typeof input.exclude === "string") {
        out.exclude = input.exclude.toLowerCase().replace(/[^a-z0-9_,\- ]/g, "").slice(0, 200);
    }
    return out;
}

// Choisit la source la mieux adaptée à l'environnement décrit dans le questionnaire
export function resolveSource(cfg, query, fileExists = fs.existsSync) {
    const warnings = [];
    const hasOpera = cfg.operaInstalled === "yes" && Boolean(cfg.operaPath) && fileExists(cfg.operaPath);
    const restricted = cfg.restricted !== "no"; // "je ne sais pas" = on suppose restreint
    let source = cfg.source;

    if (source === "auto") {
        if (cfg.vpn === "opera" && !hasOpera) {
            warnings.push("Tu as indiqué utiliser le VPN d'Opera GX, mais Opera GX est introuvable (vérifie le chemin dans les paramètres). Je bascule sur Pornhub.js.");
            source = query ? "pornhub" : "opera";
        } else if (cfg.vpn === "opera" || cfg.vpn === "system") {
            source = hasOpera ? "opera" : "pornhub";
        } else if (!restricted) {
            source = hasOpera ? "opera" : "pornhub";
        } else {
            source = hasOpera ? "opera" : "pornhub";
            warnings.push("Le site est restreint dans ton pays et aucun VPN n'est configuré : je préfère Pornhub.js avec des mots-clés ou Opera GX si tu l'as installé.");
        }
    }

    if (source === "opera" && !hasOpera) {
        warnings.push("Opera GX est introuvable (vérifie le chemin dans les paramètres). Je bascule sur Pornhub.js.");
        source = "pornhub";
    }
    if (source === "pornhub" && !query) {
        warnings.push("La source pornhub.js demande des mots-clés. Ajoute un mot-clé dans la recherche pour lancer le tri.");
    }

    return { source, warnings, hasOpera, restricted };
}

// Construit la ligne de commande de src/curate.js
export function planCurate(cfg, request = {}, scriptsDir, fileExists = fs.existsSync) {
    const query = typeof request.query === "string"
        ? request.query.trim().replace(/\s+/g, " ").replace(/^-+/, "").slice(0, 100)
        : "";
    const order = ORDERS.includes(request.order) ? request.order : cfg.order;
    const pages = clampInt(request.pages, 1, 50, cfg.pages);
    const ask = normalizeAsk(request.ask, cfg.ask);
    const exclude = cfg.exclude.trim().replace(/^-+/, "") || "none";

    const { source, warnings, hasOpera, restricted } = resolveSource(cfg, query, fileExists);

    const args = [path.join(scriptsDir, "curate.js")];
    if (query) args.push(query);
    args.push("--source", source, "--pages", String(pages), "--ask", ask, "--order", order, "--exclude", exclude);

    const env = {};
    if (source === "opera") {
        env.OPERA_PATH = cfg.operaPath;
        // La vérification du pays n'a de sens que si on compte sur le VPN d'Opera pour un site restreint
        const needsCheck = cfg.vpn === "opera" && restricted && /^[A-Z]{2}$/.test(cfg.country);
        if (needsCheck) args.push("--blocked-countries", cfg.country);
        else args.push("--skip-vpn-check");
    }

    return { args, env, warnings, source, hasOpera };
}

export function planRandom(request = {}, scriptsDir) {
    const args = [path.join(scriptsDir, "random.js")];
    if (request.all === true) args.push("--all");
    if (request.loop === true) args.push("--loop");
    return { args, env: {}, warnings: [], source: "" };
}

// Explique en français ce que l'application va faire avec les réponses du questionnaire
export function describePlan(cfg, fileExists = fs.existsSync) {
    const { source, warnings, restricted } = resolveSource(cfg, "", fileExists);
    const lines = [];
    let title;

    if (source === "opera") {
        title = "Pornhub, lu avec ton navigateur Opera GX";
        lines.push("Une fenêtre Opera GX s'ouvre (avec un profil séparé du tien) : c'est elle qui lit les pages.");
        const needsCheck = cfg.vpn === "opera" && restricted && /^[A-Z]{2}$/.test(cfg.country);
        lines.push(needsCheck
            ? `Avant de commencer, l'application vérifie que le VPN d'Opera GX est actif (le navigateur ne doit pas sortir par ${cfg.country}).`
            : "Aucune vérification du VPN n'est faite.");
        lines.push("Tu obtiens le maximum d'informations : tags, chaîne, vues, note et miniature.");
    } else {
        title = "Pornhub via pornhub.js";
        lines.push("Aucun navigateur n'est nécessaire, mais des mots-clés sont obligatoires.");
        lines.push("Pas de tags ni de chaîne.");
    }

    lines.push(cfg.operaInstalled === "yes"
        ? "Le mode hasard ouvrira aussi la vidéo tirée dans Opera GX."
        : "Opera GX n'est pas configuré : le mode hasard ne pourra pas y ouvrir les vidéos.");

    return { source, title, lines, warnings };
}