// ================================================================
// Nkap. — Rappel "2h avant" la réunion (adresse de la maison)
// Fonction PROGRAMMÉE Netlify, toutes les 15 minutes (netlify.toml,
// [functions."rappel-reunion-2h"]). Pour chaque réunion du jour dont
// l'heure de début (heure de Bruxelles) est dans moins de 2h, envoie
// une fois l'email "rappel_reunion_h2" à tous les membres actifs, puis
// coche reunions.rappel_h2_envoye pour ne jamais le renvoyer.
//
// N'envoie que si la réunion a un lieu (le but est de donner l'adresse).
// Mêmes variables d'environnement et même garde-fou PRIMARY_SITE que
// rappels-quotidiens.js (2 sites Netlify partagent la même base).
// ================================================================

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FUSEAU = "Europe/Brussels";

// "YYYY-MM-DD HH:MM" à l'heure de Bruxelles
function maintenantBxl() {
  return new Date().toLocaleString("sv-SE", { timeZone: FUSEAU }).slice(0, 16);
}

async function sbGet(path, query) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}?${query || ""}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function sbPatch(path, query, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}?${query}`, {
    method: "PATCH",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status} ${await r.text()}`);
}

async function envoyerEmail(to, subject, template, data) {
  if (!to) return;
  try {
    const r = await fetch(`${process.env.URL}/.netlify/functions/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Key": SB_KEY },
      body: JSON.stringify({ to, subject, template, data }),
    });
    if (!r.ok) console.warn("[rappel-2h] email KO", to, r.status);
  } catch (e) {
    console.warn("[rappel-2h] email erreur", to, e.message);
  }
}

// Heure de la réunion : colonne heure_debut, sinon "Heure : HH:MM" des notes
// (réunions récurrentes), sinon l'heure par défaut de la configuration.
function heureReunion(r, conf) {
  if (r.heure_debut) return String(r.heure_debut).slice(0, 5);
  const m = (r.notes || "").match(/Heure : (\d{1,2}:\d{2})/);
  if (m) return m[1].padStart(5, "0");
  return conf.heure || "17:00";
}

function minutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

exports.handler = async function () {
  if (process.env.PRIMARY_SITE !== "true") return { statusCode: 200 };
  if (!SB_URL || !SB_KEY) {
    console.error("[rappel-2h] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes");
    return { statusCode: 500 };
  }

  const now = maintenantBxl();
  const today = now.slice(0, 10);
  const nowMin = minutes(now.slice(11, 16));

  const reunions = await sbGet(
    "reunions",
    `date_reunion=eq.${today}&rappel_h2_envoye=eq.false&lieu=not.is.null&select=id,association_id,titre,lieu,heure_debut,notes,hote_membre_id`
  );
  if (!reunions.length) return { statusCode: 200 };

  const assocCache = {};
  for (const r of reunions) {
    try {
      if (!String(r.lieu || "").trim()) continue;
      if (!assocCache[r.association_id]) {
        const a = await sbGet("associations", `id=eq.${r.association_id}&select=id,nom,config_recurrence`);
        assocCache[r.association_id] = a[0] || {};
      }
      const assoc = assocCache[r.association_id];
      const conf = assoc.config_recurrence || {};
      const heure = heureReunion(r, conf);
      const reste = minutes(heure) - nowMin;
      // Fenêtre : entre 2h avant et le début de la réunion
      if (reste > 120 || reste <= 0) continue;

      // Cocher d'abord : en cas d'erreur d'envoi on préfère un rappel manqué à des doublons
      await sbPatch("reunions", `id=eq.${r.id}`, { rappel_h2_envoye: true });

      let hote = "";
      if (r.hote_membre_id) {
        const h = await sbGet("membres", `id=eq.${r.hote_membre_id}&select=prenom,nom`);
        if (h[0]) hote = `${h[0].prenom} ${h[0].nom}`;
      }
      const membres = await sbGet("membres", `association_id=eq.${r.association_id}&statut=eq.actif&select=email`);
      for (const m of membres) {
        await envoyerEmail(m.email, `🏠 Réunion à ${heure} — l'adresse — ${assoc.nom}`, "rappel_reunion_h2", {
          assoc: assoc.nom, heure, lieu: r.lieu, hote,
        });
      }
      console.log(`[rappel-2h] envoyé : réunion ${r.id} (${assoc.nom}) à ${membres.length} membre(s)`);
    } catch (e) {
      console.error("[rappel-2h] erreur réunion", r.id, e.message);
    }
  }
  return { statusCode: 200 };
};
