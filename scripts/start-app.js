// Lance l'application de bureau (npm run app) en corrigeant les pièges courants :
//  - ELECTRON_RUN_AS_NODE défini sur le PC (fréquent avec VS Code) -> Electron démarrerait comme un simple Node
//  - la sortie d'erreur est écrite dans app-log.txt, pour comprendre un éventuel plantage

import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let electronPath;
try {
    electronPath = require("electron"); // en Node, renvoie le chemin de l'exécutable
} catch {
    console.error("Electron n'est pas installé. Lance d'abord : npm install");
    process.exit(1);
}

if (typeof electronPath !== "string" || !fs.existsSync(electronPath)) {
    console.error("Le binaire d'Electron est introuvable. Relance : npm install");
    process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const logFile = fs.openSync(path.join(root, "app-log.txt"), "w");
const child = spawn(electronPath, [root], {
    env,
    stdio: ["ignore", logFile, logFile],
    detached: true
});
child.unref();

console.log("Application lancée. (journal : app-log.txt)");