// ================================================================
// Nkap. — Étape de build Netlify
// Remplace le jeton __SUPABASE_ANON_KEY__ dans index.html par la
// vraie clé (variable d'environnement SUPABASE_ANON_KEY sur Netlify),
// pour ne plus avoir cette clé en clair dans le dépôt Git (public).
//
// La clé "anon" Supabase reste visible côté navigateur une fois le
// site déployé (c'est normal et sans risque — la sécurité réelle
// vient des règles RLS côté Supabase, pas du secret de cette clé) ;
// ce script sert uniquement à éviter qu'elle traîne en clair dans
// l'historique Git public.
// ================================================================

const fs = require("fs");
const path = require("path");

const SRC = __dirname;
const DIST = path.join(__dirname, "dist");

const anonKey = process.env.SUPABASE_ANON_KEY;
if (!anonKey) {
  console.error("[build] SUPABASE_ANON_KEY manquante — build interrompu (l'ancien déploiement reste en ligne).");
  process.exit(1);
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

let html = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
if (!html.includes("__SUPABASE_ANON_KEY__")) {
  console.error("[build] Jeton __SUPABASE_ANON_KEY__ introuvable dans index.html — build interrompu.");
  process.exit(1);
}
html = html.split("__SUPABASE_ANON_KEY__").join(anonKey);
if (html.includes("__SUPABASE_ANON_KEY__")) {
  console.error("[build] Le jeton est toujours présent après remplacement — build interrompu.");
  process.exit(1);
}
fs.writeFileSync(path.join(DIST, "index.html"), html);

fs.copyFileSync(path.join(SRC, "manifest.json"), path.join(DIST, "manifest.json"));

fs.mkdirSync(path.join(DIST, "icons"), { recursive: true });
for (const f of fs.readdirSync(path.join(SRC, "icons"))) {
  fs.copyFileSync(path.join(SRC, "icons", f), path.join(DIST, "icons", f));
}

console.log("[build] OK —", DIST);
