// Gestion des listes sauvegardées (liked.json / disliked.json) : nettoyage, fusion sans doublons.
// Fonctions "pures" : aucune dépendance à Electron.

export function keyOf(lien) {
    try {
        return new URL(lien).searchParams.get("viewkey") || String(lien);
    } catch {
        return String(lien);
    }
}

const str = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

// Renvoie une entrée propre, ou null si elle est inutilisable (pas de lien https)
export function normalizeEntry(raw) {
    if (!raw || typeof raw !== "object") return null;

    const lien = str(raw.lien, 500);
    if (!/^https:\/\//.test(lien)) return null;

    const entry = {
        titre: str(raw.titre, 300) || "Sans titre",
        vue: str(String(raw.vue ?? ""), 40),
        like: str(String(raw.like ?? ""), 40),
        tag: Array.isArray(raw.tag)
            ? raw.tag.filter(t => typeof t === "string").map(t => t.trim().slice(0, 60)).filter(Boolean).slice(0, 40)
            : [],
        chaine: str(raw.chaine, 120),
        lien,
        auto: raw.auto === true
    };

    const duree = str(String(raw.duree ?? ""), 20);
    if (duree) entry.duree = duree;

    const miniature = str(raw.miniature, 500);
    if (/^https:\/\//.test(miniature)) entry.miniature = miniature;

    if (typeof raw.vu === "boolean") entry.vu = raw.vu;
    if (typeof raw.plait === "boolean") entry.plait = raw.plait;

    return entry;
}

export function parseEntries(text) {
    const trimmed = String(text ?? "").trim();
    if (!trimmed) return [];
    const data = JSON.parse(trimmed);
    if (!Array.isArray(data)) throw new Error("le fichier doit contenir une liste");
    return data;
}

// Ajoute à "existing" les entrées de "incoming" qui n'y sont pas déjà (ni dans "alsoKnown")
export function mergeEntries(existing, incoming, alsoKnown = []) {
    const known = new Set([...existing, ...alsoKnown].map(entry => keyOf(entry.lien)));
    const merged = [...existing];
    let added = 0;
    let skipped = 0;

    for (const raw of incoming) {
        const entry = normalizeEntry(raw);
        if (!entry) { skipped++; continue; }

        const key = keyOf(entry.lien);
        if (known.has(key)) { skipped++; continue; }

        known.add(key);
        merged.push(entry);
        added++;
    }
    return { merged, added, skipped };
}