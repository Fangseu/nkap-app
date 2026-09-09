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
//   APP_URL         (optionnel)   — ex: "https://votredomaine.com" — si définie,
//                                   ajoute un bouton "Ouvrir mon espace" dans l'email.
// ================================================================

const VERT_H1 = "#2d7a52";
const VERT_H2 = "#173d29";
const VERT_TEXTE = "#4f8a6b";
const INDIGO = "#6366f1";
const CARTE_BG = "#eef0fb";
const TEXT = "#141b17";
const BORDER = "#e6e9ef";
const BG = "#f4f6f9";
const ROUGE = "#e85656";

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function ligneCard(label, valeur) {
  if (valeur === undefined || valeur === null || valeur === "") return "";
  return `<tr>
    <td style="padding:9px 0;color:${VERT_TEXTE};font-size:14px;text-align:left">${esc(label)}</td>
    <td style="padding:9px 0;color:${TEXT};font-size:15px;font-weight:800;text-align:right">${esc(valeur)}</td>
  </tr>`;
}

function badge(texte, couleur) {
  if (!texte) return "";
  return `<span style="display:inline-block;padding:5px 14px;border-radius:20px;font-size:13px;font-weight:700;background:${couleur}1a;color:${couleur}">${esc(texte)}</span>`;
}

// Contenu par template : icône (emoji large), titre, sous-titre, lignes de détail,
// pastille éventuelle (résultat de vote) et phrase de clôture chaleureuse.
function contenuTemplate(template, data) {
  data = data || {};
  switch (template) {
    case "bienvenue":
      return {
        icone: "👋",
        titre: "Bienvenue !",
        souslitre: `Votre compte ${esc(data.assoc)} est prêt`,
        lignes: "",
        cloture: "Connectez-vous dès maintenant à votre espace membre.",
      };
    case "paiement_valide":
      return {
        icone: "✅",
        titre: "Paiement validé",
        souslitre: "Merci, votre règlement a bien été reçu",
        lignes: ligneCard("Type", data.type) + ligneCard("Montant", data.montant) + ligneCard("Date", data.date),
        cloture: "Merci pour votre confiance !",
      };
    case "rappel_cotisation":
      return {
        icone: "💳",
        titre: "Rappel de cotisation",
        souslitre: "Une cotisation reste à régler",
        lignes: ligneCard("Mois", data.mois) + ligneCard("Montant", data.montant),
        cloture: "Merci de régulariser dès que possible.",
      };
    case "rappel_reunion":
      return {
        icone: "📅",
        titre: "Rappel de réunion",
        souslitre: "Une réunion est prévue prochainement",
        lignes: ligneCard("Date", data.date) + ligneCard("Heure", data.heure) + ligneCard("Lieu", data.lieu || "À confirmer"),
        cloture: "Votre présence est importante. À bientôt !",
      };
    case "rappel_reunion_j1":
      return {
        icone: "⏰",
        titre: "Réunion demain !",
        souslitre: "N'oubliez pas la réunion de demain",
        lignes: ligneCard("Date", data.date) + ligneCard("Heure", data.heure) + ligneCard("Lieu", data.lieu || "À confirmer"),
        cloture: "Votre présence est importante. À bientôt !",
      };
    case "tour_tontine":
      return {
        icone: "🎰",
        titre: "C'est votre tour !",
        souslitre: "Votre tour de tontine est arrivé",
        lignes: ligneCard("Mois", data.mois) + ligneCard("Gain", data.gain),
        cloture: "Félicitations !",
      };
    case "sanction":
      return {
        icone: "⚠️",
        titre: `${esc(data.type_sanction || "Sanction")} enregistrée`,
        souslitre: "Une sanction a été appliquée à votre compte",
        lignes: ligneCard("Type", data.type_sanction) + ligneCard("Montant", data.montant) + ligneCard("Motif", data.motif) + ligneCard("Date", data.date),
        cloture: "N'hésitez pas à contacter le bureau pour toute question.",
      };
    case "gain_verse":
      return {
        icone: "💰",
        titre: "Versement effectué",
        souslitre: "Un montant vous a été versé",
        lignes: ligneCard("Montant", data.montant) + ligneCard("Date", data.date),
        cloture: "Merci de votre participation !",
      };
    case "echange_recu":
      return {
        icone: "🔀",
        titre: "Demande d'échange",
        souslitre: `${esc(data.demandeur)} vous propose un échange de tour`,
        lignes: ligneCard("Il cède", data.mois_demandeur) + ligneCard("Contre votre mois", data.mois_accepteur),
        cloture: data.raison ? `« ${data.raison} » — Consultez votre espace membre pour répondre.` : "Consultez votre espace membre pour répondre.",
      };
    case "echange_accepte":
      return {
        icone: "✅",
        titre: "Échange accepté",
        souslitre: `${esc(data.accepteur)} a accepté votre échange`,
        lignes: ligneCard("Nouveau mois", data.nouveau_mois),
        cloture: "À bientôt !",
      };
    case "nouveau_vote":
      return {
        icone: "🗳️",
        titre: "Nouveau vote",
        souslitre: esc(data.titre),
        lignes: ligneCard("Majorité requise", data.majorite) + ligneCard("Date limite", data.date_limite),
        cloture: "Rendez-vous dans votre espace membre pour voter.",
      };
    case "resultat_vote": {
      const adopte = data.resultat && /adopt/i.test(data.resultat);
      return {
        icone: "📊",
        titre: "Résultat du vote",
        souslitre: esc(data.titre),
        pastille: badge(data.resultat, adopte ? VERT_H1 : ROUGE),
        lignes: ligneCard("Pour", data.pour) + ligneCard("Contre", data.contre) + ligneCard("Abstention", data.abstention),
        cloture: "Merci à tous les votants !",
      };
    }
    default:
      return {
        icone: "🔔",
        titre: "Notification",
        souslitre: `Nouvelle notification de ${esc(data.assoc || "Nkap.")}`,
        lignes: "",
        cloture: "",
      };
  }
}

function buildHtml(template, data) {
  data = data || {};
  const c = contenuTemplate(template, data);
  const appUrl = process.env.APP_URL;
  const bouton = appUrl
    ? `<table cellpadding="0" cellspacing="0" style="margin:24px auto 0"><tr><td style="border-radius:10px;background:${VERT_H1}">
         <a href="${esc(appUrl)}" style="display:inline-block;padding:12px 26px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;font-family:Arial,sans-serif">Ouvrir mon espace →</a>
       </td></tr></table>`
    : "";

  return `<!doctype html><html><body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 12px">
    <tr><td align="center">
      <table width="100%" style="max-width:480px" cellpadding="0" cellspacing="0">

        <!-- En-tête -->
        <tr><td style="background:linear-gradient(135deg,${VERT_H1},${VERT_H2});background-color:${VERT_H2};border-radius:16px 16px 0 0;padding:24px 28px">
          <span style="color:#ffffff;font-size:26px;font-weight:800;font-family:Georgia,'Times New Roman',serif">Nkap.</span>
          ${data.assoc ? `<span style="color:#cfe3d7;font-size:12px;letter-spacing:1px;font-weight:700;margin-left:8px">${esc(String(data.assoc).toUpperCase())}</span>` : ""}
        </td></tr>

        <!-- Corps -->
        <tr><td style="background:#ffffff;padding:38px 28px;text-align:center;border-left:1px solid ${BORDER};border-right:1px solid ${BORDER}">
          <div style="font-size:56px;line-height:1">${c.icone}</div>
          <h1 style="margin:18px 0 6px;color:${TEXT};font-size:23px;font-weight:800">${c.titre}</h1>
          ${c.souslitre ? `<p style="margin:0 0 24px;color:${VERT_TEXTE};font-size:15px">${c.souslitre}</p>` : ""}

          ${
            c.lignes
              ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:${CARTE_BG};border-left:4px solid ${INDIGO};border-radius:10px;text-align:left">
                   <tr><td style="padding:4px 20px">
                     <table width="100%" cellpadding="0" cellspacing="0">${c.lignes}</table>
                   </td></tr>
                 </table>`
              : ""
          }

          ${c.pastille ? `<div style="margin-top:18px">${c.pastille}</div>` : ""}

          ${c.cloture ? `<p style="margin:24px 0 0;color:${VERT_TEXTE};font-size:14px">${c.cloture}</p>` : ""}

          ${bouton}
        </td></tr>

        <!-- Pied de page -->
        <tr><td style="background:${BG};border-radius:0 0 16px 16px;border:1px solid ${BORDER};border-top:none;padding:18px 28px;text-align:center">
          <span style="color:#8a9a91;font-size:12px">Envoyé par <strong>${esc(data.assoc || "Nkap.")}</strong> via Nkap.</span><br>
          <span style="color:#a9b8b0;font-size:11px">Notre nkap mérite mieux qu'Excel.</span>
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
