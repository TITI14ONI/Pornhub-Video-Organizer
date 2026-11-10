import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { mergeEntries, parseEntries } from "./library.js";
import { DEFAULTS, describePlan, planCurate, planRandom, sanitizeConfig } from "./plan.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS_DIR = path.join(app.getAppPath(), "src");

let mainWindow = null;
let current = null; // processus en cours (curate.js ou random.js)

/* ========== JOURNAL D'ERREURS ========== */
// Si l'application plante, l'erreur est affichée ET écrite dans crash.log (dossier des données).

function logCrash(error) {
    try {
        const line = `[${new Date().toISOString()}] ${error?.stack || error}\n`;
        fs.appendFileSync(path.join(app.getPath("userData"), "crash.log"), line, "utf8");
    } catch { /* on ne peut rien faire de plus */ }
}

function showCrash(error) {
    logCrash(error);
    try {
        dialog.showErrorBox("Pornhub Video Organizer : erreur", String(error?.message || error));
    } catch { /* l'application n'est peut-être pas prête */ }
}

process.on("uncaughtException", showCrash);
process.on("unhandledRejection", logCrash);

/* ========== DONNÉES ========== */
// Config + listes sauvegardées vivent dans le dossier utilisateur de l'application,
// jamais dans le dépôt Git. Les scripts de src/ sont lancés avec ce dossier comme répertoire courant.

const dataDir = path.join(app.getPath("userData"), "data");
const configFile = path.join(app.getPath("userData"), "config.json");
fs.mkdirSync(dataDir, { recursive: true });

function loadConfig() {
    let saved = {};
    try {
        saved = JSON.parse(fs.readFileSync(configFile, "utf8"));
    } catch { /* première ouverture */ }
    return { ...DEFAULTS, ...sanitizeConfig(saved) };
}

function saveConfig(update) {
    const merged = { ...loadConfig(), ...sanitizeConfig(update) };
    fs.writeFileSync(configFile, JSON.stringify(merged, null, 2), "utf8");
    return merged;
}

const LISTS = { liked: "liked.json", disliked: "disliked.json" };

function readList(list) {
    try {
        const data = JSON.parse(fs.readFileSync(path.join(dataDir, LISTS[list]), "utf8"));
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function writeList(list, entries) {
    fs.writeFileSync(path.join(dataDir, LISTS[list]), JSON.stringify(entries, null, 2), "utf8");
}

function detectOpera() {
    const local = process.env.LOCALAPPDATA || "";
    const candidates =
        process.platform === "win32" ? [
            path.join(local, "Programs", "Opera GX", "opera.exe"),
            path.join(local, "Programs", "Opera GX", "launcher.exe"),
            "C:\\Program Files\\Opera GX\\opera.exe",
            "C:\\Program Files (x86)\\Opera GX\\opera.exe"
        ] : process.platform === "darwin" ? [
            "/Applications/Opera GX.app/Contents/MacOS/Opera GX"
        ] : [
            "/usr/bin/opera",
            "/snap/bin/opera"
        ];
    return candidates.find(candidate => fs.existsSync(candidate)) ?? "";
}

/* ========== LANCEMENT DES SCRIPTS ========== */

function send(channel, payload) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

// Découpe un flux en lignes complètes
function pipeLines(stream, handler) {
    let buffer = "";
    stream.setEncoding("utf8");
    stream.on("data", chunk => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop();
        for (const line of lines) if (line.trim()) handler(line);
    });
    stream.on("end", () => {
        if (buffer.trim()) handler(buffer);
    });
}

// Termine un processus ET ses enfants (la fenêtre Opera GX par exemple)
function killTree(child) {
    if (!child || child.killed) return;
    if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
    } else {
        child.kill();
    }
}

ipcMain.handle("run:start", (_event, request) => {
    if (current) return { ok: false, error: "Un programme est déjà en cours." };

    const cfg = loadConfig();
    if (!cfg.setupDone || !cfg.adult) return { ok: false, error: "Termine d'abord le questionnaire." };

    const kind = request?.kind === "random" ? "random" : "curate";
    const plan = kind === "random"
        ? planRandom(request, SCRIPTS_DIR)
        : planCurate(cfg, request, SCRIPTS_DIR);

    // ELECTRON_RUN_AS_NODE : on réutilise le Node intégré à Electron pour lancer les scripts tels quels.
    // --json : les scripts parlent en lignes JSON, que l'interface transforme en fiches et boutons.
    const childEnv = { ...process.env, ...plan.env, ELECTRON_RUN_AS_NODE: "1", FORCE_COLOR: "0" };
    if (kind === "random") {
        childEnv.OPERA_PATH = cfg.operaPath || detectOpera();
        childEnv.OPERA_PROFILE_DIR = path.join(dataDir, "opera-profile");
    }

    const child = spawn(process.execPath, [...plan.args, "--json"], {
        cwd: dataDir,
        env: childEnv,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
    });
    current = child;

    pipeLines(child.stdout, line => {
        try {
            send("run:event", JSON.parse(line));
        } catch {
            send("run:event", { type: "log", level: "info", message: line });
        }
    });
    pipeLines(child.stderr, line => send("run:event", { type: "log", level: "error", message: line }));

    child.on("error", error => {
        current = null;
        send("run:event", { type: "log", level: "error", message: `Impossible de lancer le programme : ${error.message}` });
        send("run:exit", -1);
    });
    child.on("close", code => {
        if (current !== child) return;
        current = null;
        send("run:exit", code ?? 0);
    });

    return { ok: true, warnings: plan.warnings, source: plan.source };
});

ipcMain.on("run:input", (_event, text) => {
    if (!current || typeof text !== "string" || text.length > 20) return;
    current.stdin.write(text.replace(/[\r\n]/g, "") + "\n");
});

// Arrêt en douceur ("q" : le script ferme Opera GX lui-même), puis de force si rien ne se passe
ipcMain.on("run:stop", () => {
    const target = current;
    if (!target) return;

    try { target.stdin.write("q\n"); } catch { /* déjà fermé */ }
    setTimeout(() => {
        if (current === target) killTree(target);
    }, 4000);
});

/* ========== CONFIG, OPERA, DOSSIERS ========== */

ipcMain.handle("config:get", () => loadConfig());
ipcMain.handle("config:set", (_event, update) => saveConfig(update));
ipcMain.handle("opera:detect", () => detectOpera());
ipcMain.handle("plan:describe", (_event, answers) =>
    describePlan({ ...DEFAULTS, ...sanitizeConfig(answers) }));

ipcMain.handle("dialog:pickOpera", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ["openFile"],
        filters: process.platform === "win32" ? [{ name: "Exécutable", extensions: ["exe"] }] : []
    });
    return result.canceled ? "" : result.filePaths[0];
});

ipcMain.handle("data:path", () => dataDir);
ipcMain.on("data:open", () => { shell.openPath(dataDir); });

ipcMain.handle("browser:open-video", (_event, url) => {
    try {
        const target = new URL(url);
        const validHost = target.hostname === "pornhub.com" || target.hostname.endsWith(".pornhub.com");
        const viewkey = target.searchParams.get("viewkey") || "";
        if (target.protocol !== "https:" || !validHost || target.pathname !== "/view_video.php" || !/^[a-z0-9]+$/i.test(viewkey)) {
            return { ok: false, error: "Le lien de la vidéo n'est pas valide." };
        }

        const cfg = loadConfig();
        const executable = cfg.operaPath || detectOpera();
        if (!executable || !fs.existsSync(executable)) {
            return { ok: false, error: "Le navigateur configuré (Opera GX) est introuvable. Vérifie son emplacement dans les paramètres." };
        }

        const child = spawn(executable, [
            `--user-data-dir=${path.join(dataDir, "opera-profile")}`,
            target.href
        ], { detached: true, stdio: "ignore", windowsHide: false });

        return new Promise(resolve => {
            child.once("error", error => resolve({ ok: false, error: `Impossible d'ouvrir Opera GX : ${error.message}` }));
            child.once("spawn", () => {
                child.unref();
                resolve({ ok: true });
            });
        });
    } catch (error) {
        return { ok: false, error: `Impossible d'ouvrir le lien : ${error.message}` };
    }
});

/* ========== BIBLIOTHÈQUE ========== */

ipcMain.handle("library:get", () => ({ liked: readList("liked"), disliked: readList("disliked") }));

ipcMain.handle("library:update", (_event, { action, lien, from }) => {
    if (current) return { ok: false, error: "Arrête d'abord le programme en cours." };
    if (!["move", "remove"].includes(action) || !LISTS[from]) return { ok: false, error: "Action invalide." };

    const source = readList(from);
    const index = source.findIndex(entry => entry.lien === lien);
    if (index === -1) return { ok: false, error: "Vidéo introuvable." };

    const [entry] = source.splice(index, 1);
    if (action === "move") {
        const to = from === "liked" ? "disliked" : "liked";
        writeList(to, [...readList(to), { ...entry, auto: false }]);
    }
    writeList(from, source);
    return { ok: true };
});

/* ----- Import d'anciennes sauvegardes (ex. celles créées en terminal) ----- */

function countEntries(file) {
    try {
        return parseEntries(fs.readFileSync(file, "utf8")).length;
    } catch {
        return 0;
    }
}

// Cherche des liked.json / disliked.json dans les dossiers courants de l'utilisateur (profondeur limitée)
async function findSaves() {
    const roots = [...new Set([
        process.cwd(),
        app.getAppPath(),
        app.getPath("desktop"),
        app.getPath("documents"),
        app.getPath("downloads")
    ].map(dir => path.resolve(dir)))];

    const ignored = new Set(["node_modules", "dist", "appdata", "opera-profile", "$recycle.bin"]);
    const found = new Map();
    let visited = 0;

    async function walk(dir, depth) {
        if (visited++ > 4000 || path.resolve(dir) === path.resolve(dataDir)) return;

        let entries;
        try {
            entries = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        const names = new Set(entries.filter(e => e.isFile()).map(e => e.name.toLowerCase()));
        if (names.has("liked.json") || names.has("disliked.json")) {
            const liked = countEntries(path.join(dir, "liked.json"));
            const disliked = countEntries(path.join(dir, "disliked.json"));
            if (liked + disliked > 0) found.set(dir, { dir, liked, disliked });
        }

        if (depth >= 5) return;
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith(".") || ignored.has(entry.name.toLowerCase())) continue;
            await walk(path.join(dir, entry.name), depth + 1);
        }
    }

    for (const root of roots) await walk(root, 0);
    return [...found.values()];
}

// pairs : [{ list: "liked" | "disliked", file }]
function importPairs(pairs) {
    if (current) return { ok: false, error: "Arrête d'abord le programme en cours." };

    let added = 0;
    let skipped = 0;

    for (const { list, file } of pairs) {
        let incoming;
        try {
            incoming = parseEntries(fs.readFileSync(file, "utf8"));
        } catch (error) {
            return { ok: false, error: `${path.basename(file)} est illisible : ${error.message}` };
        }

        const other = list === "liked" ? "disliked" : "liked";
        const result = mergeEntries(readList(list), incoming, readList(other));
        writeList(list, result.merged);
        added += result.added;
        skipped += result.skipped;
    }
    return { ok: true, added, skipped };
}

ipcMain.handle("library:detect", () => findSaves());

ipcMain.handle("library:import-dir", (_event, dir) => {
    if (typeof dir !== "string") return { ok: false, error: "Dossier invalide." };

    const pairs = [];
    for (const list of ["liked", "disliked"]) {
        const file = path.join(dir, LISTS[list]);
        if (fs.existsSync(file)) pairs.push({ list, file });
    }
    return pairs.length ? importPairs(pairs) : { ok: false, error: "Aucun fichier liked.json / disliked.json dans ce dossier." };
});

ipcMain.handle("library:import-files", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: "Choisis tes fichiers liked.json et/ou disliked.json",
        properties: ["openFile", "multiSelections"],
        filters: [{ name: "Sauvegardes JSON", extensions: ["json"] }]
    });
    if (result.canceled) return { ok: false, canceled: true };

    const pairs = [];
    for (const file of result.filePaths) {
        const name = path.basename(file).toLowerCase();
        if (name.includes("dislike")) pairs.push({ list: "disliked", file });
        else if (name.includes("like")) pairs.push({ list: "liked", file });
    }
    return pairs.length
        ? importPairs(pairs)
        : { ok: false, error: "Les fichiers doivent s'appeler liked.json (aimées) ou disliked.json (refusées)." };
});

/* ========== MINIATURES ========== */
// Les sites refusent souvent les images "hotlinkées" : on les télécharge ici avec le bon Referer.

const thumbCache = new Map();

ipcMain.handle("thumb:get", async (_event, url) => {
    try {
        const target = new URL(url);
        const isPornhub = target.hostname.endsWith(".phncdn.com");
        if (target.protocol !== "https:" || !isPornhub) return null;

        if (thumbCache.has(target.href)) return thumbCache.get(target.href);

        const response = await fetch(target, {
            headers: {
                "Referer": "https://www.pornhub.com/",
                "User-Agent": "Mozilla/5.0"
            },
            signal: AbortSignal.timeout(10000)
        });
        const type = response.headers.get("content-type") || "";
        if (!response.ok || !type.startsWith("image/")) return null;

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > 3_000_000) return null;

        const dataUrl = `data:${type};base64,${buffer.toString("base64")}`;
        thumbCache.set(target.href, dataUrl);
        if (thumbCache.size > 300) thumbCache.delete(thumbCache.keys().next().value);
        return dataUrl;
    } catch {
        return null;
    }
});

/* ========== FENÊTRE ========== */

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 780,
        minWidth: 820,
        minHeight: 600,
        backgroundColor: "#7a7ab8",
        title: "Pornhub Video Organizer",
        webPreferences: {
            preload: path.join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    mainWindow.setMenuBarVisibility(false);
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    mainWindow.webContents.on("will-navigate", event => event.preventDefault());
    mainWindow.webContents.on("preload-error", (_event, file, error) => showCrash(error));
    mainWindow.webContents.on("render-process-gone", (_event, details) => logCrash(`Rendu arrêté : ${details.reason}`));
    mainWindow.webContents.on("did-fail-load", (_event, code, description) => logCrash(`Chargement échoué : ${description} (${code})`));
    mainWindow.loadFile(path.join(__dirname, "index.html"));
}

// Pas de "await app.whenReady()" ici : avec un module principal ESM, Electron attend la fin de ce
// fichier avant de déclencher "ready", donc attendre "ready" au niveau racine bloque l'application.
app.whenReady()
    .then(createWindow)
    .catch(error => {
        showCrash(error);
        app.quit();
    });

app.on("before-quit", () => {
    killTree(current);
});
app.on("window-all-closed", () => app.quit());