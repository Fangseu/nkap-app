// ================================================================
// Nkap. — Rappels automatiques quotidiens (réunions, cotisations)
// Fonction PROGRAMMÉE Netlify : tourne toute seule, indépendamment
// de toute connexion admin (contrairement à verifierEtNotifier() côté
// client, qui ne s'exécute que si un admin a l'app ouverte).
//
// Variables d'environnement requises dans Netlify (Site configuration
// → Environment variables), sur CHAQUE site :
//   SUPABASE_URL                — ex: https://nkfzmzbteqrdbyjtgwsh.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   — clé service_role (Project Settings → API sur Supabase)
//                                  ⚠️ Ne JAMAIS mettre cette clé dans le code / git.
//
// Réutilise la fonction /.netlify/functions/send-email déjà en place
// (même template, aucun code dupliqué) pour l'envoi des emails.
// ================================================================

const { schedule } = require("@netlify/functions");

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function td() {
  return new Date().toISOString().slice(0, 10);
}

async function sbGet(path, query) {
  const url = `${SB_URL}/rest/v1/${path}?${query || ""}`;
  const r = await fetch(url, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function sbPatch(path, query, body) {
  const url = `${SB_URL}/rest/v1/${path}?${query}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status} ${await r.text()}`);
}

async function sbUpsert(path, body) {
  const url = `${SB_URL}/rest/v1/${path}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`UPSERT ${path} → ${r.status} ${await r.text()}`);
}

// Envoie un email via la fonction send-email déjà déployée (même template)
async function envoyerEmail(to, subject, template, data) {
  if (!to) return;
  try {
    const r = await fetch(`${process.env.URL}/.netlify/functions/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, template, data }),
    });
    if (!r.ok) console.warn("[rappels] email KO", to, template, r.status);
  } catch (e) {
    console.warn("[rappels] email erreur", to, template, e.message);
  }
}

async function envoyerWhatsApp(telephone, templateName, params, assocNom) {
  if (!telephone) return;
  try {
    await fetch(`${SB_URL}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY },
      body: JSON.stringify({ telephone, template: templateName, params: [assocNom || "Nkap."].concat(params || []), langue: "fr_BE" }),
    });
  } catch (e) {
    console.warn("[rappels] whatsapp erreur", telephone, e.message);
  }
}

async function traiterReunions(assoc) {
  const dans3j = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const reunions = await sbGet(
    "reunions",
    `association_id=eq.${assoc.id}&date_reunion=gte.${td()}&date_reunion=lte.${dans3j}&or=(rappel_envoye.eq.false,rappel_j1_envoye.eq.false)&select=id,titre,date_reunion,lieu,rappel_envoye,rappel_j1_envoye`
  );
  if (!reunions.length) return;

  const conf = assoc.config_recurrence || {};
  const rappelJours = conf.rappel != null ? conf.rappel : 2;
  const heure = conf.heure || "17:00";
  const membres = await sbGet("membres", `association_id=eq.${assoc.id}&statut=eq.actif&select=email,tel`);

  for (const r of reunions) {
    const diffJours = Math.round((new Date(r.date_reunion) - new Date(td())) / 86400000);
    const dateStr = new Date(r.date_reunion).toLocaleDateString("fr-FR");
    const lieu = r.lieu || "";

    if (diffJours <= rappelJours && !r.rappel_envoye) {
      for (const m of membres) {
        await envoyerEmail(m.email, `📅 Réunion — ${r.titre} — ${assoc.nom}`, "rappel_reunion", { assoc: assoc.nom, date: dateStr, heure, lieu });
        await envoyerWhatsApp(m.tel, "rappel_reunion", [dateStr, lieu], assoc.nom);
      }
      await sbPatch("reunions", `id=eq.${r.id}`, { rappel_envoye: true });
    }

    if (diffJours === 1 && !r.rappel_j1_envoye) {
      for (const m of membres) {
        await envoyerEmail(m.email, `⏰ Rappel — Réunion DEMAIN — ${assoc.nom}`, "rappel_reunion_j1", { assoc: assoc.nom, date: dateStr, heure, lieu });
      }
      await sbPatch("reunions", `id=eq.${r.id}`, { rappel_j1_envoye: true });
    }
  }
}

async function traiterCotisations(assoc) {
  const cots = await sbGet("cotisations", `association_id=eq.${assoc.id}&statut=eq.impaye&select=membre_id,mois,montant`);
  if (cots.length < 3) return;

  const etat = await sbGet("notif_daily_state", `association_id=eq.${assoc.id}&type=eq.cotisations&select=last_date`);
  if (etat.length && etat[0].last_date === td()) return; // déjà envoyé aujourd'hui

  const membreIds = [...new Set(cots.map((c) => c.membre_id))];
  const membres = await sbGet("membres", `id=in.(${membreIds.join(",")})&select=id,prenom,nom,email,tel`);
  const sym = { EUR: "€", USD: "$", GBP: "£", XAF: "FCFA", XOF: "CFA" }[assoc.devise] || assoc.devise || "€";

  for (const cot of cots) {
    const mb = membres.find((m) => m.id === cot.membre_id);
    if (!mb) continue;
    await envoyerEmail(mb.email, `💳 Rappel cotisation — ${assoc.nom}`, "rappel_cotisation", {
      assoc: assoc.nom,
      membre: `${mb.prenom} ${mb.nom}`,
      montant: `${cot.montant} ${sym}`,
      mois: cot.mois,
    });
    await envoyerWhatsApp(mb.tel, "rappel_cotisation", [`${cot.montant} ${sym}`, cot.mois || ""], assoc.nom);
  }

  await sbUpsert("notif_daily_state", { association_id: assoc.id, type: "cotisations", last_date: td() });
}

exports.handler = schedule("0 7 * * *", async () => {
  if (!SB_URL || !SB_KEY) {
    console.error("[rappels] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes");
    return { statusCode: 500 };
  }

  const associations = await sbGet("associations", "select=id,nom,devise,config_recurrence");

  for (const assoc of associations) {
    try {
      await traiterReunions(assoc);
      await traiterCotisations(assoc);
    } catch (e) {
      console.error("[rappels] erreur association", assoc.id, e.message);
    }
  }

  console.log(`[rappels] terminé pour ${associations.length} association(s)`);
  return { statusCode: 200 };
});
