// ================================================================
// Nkap. — Envoi d'emails transactionnels via Resend
// Appelée par envoyerEmail() dans index.html : POST /.netlify/functions/send-email
// Body attendu : { to, subject, template, data }
// Variables d'environnement à définir dans Netlify (Site configuration
// → Environment variables) :
//   RESEND_API_KEY  (obligatoire) — clé API de votre compte Resend
//   EMAIL_FROM      (optionnel)   — ex: "Nkap. <notifications@votredomaine.com>"
//                                   doit être un domaine vérifié dans Resend.
//                                   Sans ça, on retombe sur onboarding@resend.dev
//                                   (fonctionne pour tester, mais limité en prod).
// ================================================================

const ACCENT = "#1a9e7a";

function ligne(label, valeur) {
  if (valeur === undefined || valeur === null || valeur === "") return "";
  return `<tr><td style="padding:4px 0;color:#64748b;font-size:13px">${esc(label)}</td>
    <td style="padding:4px 0;color:#0f1923;font-size:13px;font-weight:600;text-align:right">${esc(valeur)}</td></tr>`;
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Construit le contenu (titre + paragraphe + tableau de détails) selon le template
function contenuTemplate(template, data) {
  data = data || {};
  switch (template) {
    case "bienvenue":
      return {
        titre: `Bienvenue dans ${esc(data.assoc)} !`,
        texte: `Bonjour ${esc(data.prenom || "")},<br><br>Votre compte a été créé sur <strong>Nkap.</strong> pour l'association <strong>${esc(data.assoc)}</strong>. Vous pouvez dès maintenant vous connecter à votre espace membre.`,
        lignes: "",
      };
    case "paiement_valide":
      return {
        titre: "Paiement validé",
        texte: `Bonjour ${esc(data.membre || "")},<br><br>Votre paiement a bien été validé.`,
        lignes: ligne("Type", data.type) + ligne("Montant", data.montant) + ligne("Date", data.date),
      };
    case "rappel_cotisation":
      return {
        titre: "Rappel de cotisation",
        texte: `Bonjour ${esc(data.membre || "")},<br><br>Un rappel amical : la cotisation ci-dessous reste à régler.`,
        lignes: ligne("Mois", data.mois) + ligne("Montant", data.montant),
      };
    case "rappel_reunion":
    case "rappel_reunion_j1":
      return {
        titre: template === "rappel_reunion_j1" ? "Réunion demain !" : "Nouvelle réunion programmée",
        texte: `Bonjour,<br><br>Une réunion de <strong>${esc(data.assoc)}</strong> est programmée.`,
        lignes: ligne("Date", data.date) + ligne("Heure", data.heure) + ligne("Lieu", data.lieu),
      };
    case "tour_tontine":
      return {
        titre: "C'est votre tour de tontine !",
        texte: `Bonjour ${esc(data.membre || "")},<br><br>C'est votre tour pour ce cycle de tontine.`,
        lignes: ligne("Mois", data.mois) + ligne("Gain", data.gain),
      };
    case "sanction":
      return {
        titre: `${esc(data.type_sanction || "Sanction")} enregistrée`,
        texte: `Bonjour ${esc(data.membre || "")},<br><br>Une sanction a été enregistrée sur votre compte.`,
        lignes: ligne("Type", data.type_sanction) + ligne("Montant", data.montant) + ligne("Motif", data.motif) + ligne("Date", data.date),
      };
    case "gain_verse":
      return {
        titre: "Versement effectué",
        texte: `Bonjour ${esc(data.membre || "")},<br><br>Un montant vous a été versé.`,
        lignes: ligne("Montant", data.montant) + ligne("Date", data.date),
      };
    case "echange_recu":
      return {
        titre: "Demande d'échange de tour",
        texte: `Bonjour,<br><br><strong>${esc(data.demandeur)}</strong> vous propose un échange de tour de tontine.${data.raison ? `<br><br>Raison : ${esc(data.raison)}` : ""}`,
        lignes: ligne("Il cède", data.mois_demandeur) + ligne("Contre votre mois", data.mois_accepteur),
      };
    case "echange_accepte":
      return {
        titre: "Échange de tour accepté",
        texte: `Bonjour,<br><br><strong>${esc(data.accepteur)}</strong> a accepté votre échange de tour.`,
        lignes: ligne("Nouveau mois", data.nouveau_mois),
      };
    case "nouveau_vote":
      return {
        titre: "🗳️ Nouveau vote",
        texte: `Bonjour,<br><br>Un nouveau vote a été lancé pour <strong>${esc(data.assoc)}</strong> :<br><br><strong>${esc(data.titre)}</strong>${data.description ? `<br>${esc(data.description)}` : ""}<br><br>Rendez-vous dans votre espace membre pour voter.`,
        lignes: ligne("Majorité requise", data.majorite) + ligne("Date limite", data.date_limite),
      };
    case "resultat_vote":
      return {
        titre: "📊 Résultat du vote",
        texte: `Bonjour,<br><br>Le vote <strong>${esc(data.titre)}</strong> est clôturé : <strong>${esc(data.resultat)}</strong>.`,
        lignes: ligne("Pour", data.pour) + ligne("Contre", data.contre) + ligne("Abstention", data.abstention),
      };
    default:
      return {
        titre: "Notification",
        texte: `Bonjour,<br><br>Vous avez une nouvelle notification de <strong>${esc(data.assoc || "Nkap.")}</strong>.`,
        lignes: "",
      };
  }
}

function buildHtml(template, data) {
  const c = contenuTemplate(template, data);
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:24px 0">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden">
        <tr><td style="background:${ACCENT};padding:20px 28px">
          <span style="color:#ffffff;font-size:20px;font-weight:700">Nkap.</span>
        </td></tr>
        <tr><td style="padding:28px">
          <h2 style="margin:0 0 12px;color:#0f1923;font-size:18px">${c.titre}</h2>
          <p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6">${c.texte}</p>
          ${c.lignes ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;padding-top:8px;margin-top:8px">${c.lignes}</table>` : ""}
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f4f6f9;color:#94a3b8;font-size:11px">
          Notification automatique — Nkap., logiciel de gestion d'association.
        </td></tr>
      </table>
    </td></tr>
  </table>
  </body></html>`;
}

exports.handler = async function (event) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: "Méthode non autorisée" }) };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: "RESEND_API_KEY manquante côté serveur" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Corps de requête invalide" }) };
  }

  const { to, subject, template, data } = payload;
  if (!to || !subject) {
    return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: "Champs 'to' et 'subject' requis" }) };
  }

  const from = process.env.EMAIL_FROM || "Nkap. <onboarding@resend.dev>";
  const html = buildHtml(template, data);

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const resData = await r.json();
    if (!r.ok) {
      return { statusCode: r.status, headers, body: JSON.stringify({ success: false, error: resData }) };
    }
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, id: resData.id }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: String(e.message || e) }) };
  }
};
