'use strict';
/**
 * =============================================================================
 *  CONSOLE D'ADMINISTRATION — journal d'audit
 *
 *  Append-only, une ligne JSON par événement. Ce journal fait partie du
 *  dossier de conformité : il répond à « qui a provisionné quoi, et quand »,
 *  et « qui a ouvert ou fermé quelle session ».
 *
 *  RÈGLE : aucun mot de passe, aucune empreinte, aucun jeton n'entre ici.
 *  Le journal est lu par la console ; ce qu'on y met est exposé.
 * =============================================================================
 */

const fs = require('fs');
const path = require('path');

const FICHIER = process.env.ADMIN_JOURNAL
  || path.join(__dirname, 'etat', 'journal.jsonl');

// Champs dont la valeur ne doit jamais être écrite, quel que soit l'appelant.
const INTERDITS = new Set([
  'motDePasse', 'motdepasse', 'password', 'empreinte', 'passwd',
  'jeton', 'token', 'authToken', 'secret', 'cle',
]);

function nettoyer(valeur, profondeur = 0) {
  if (profondeur > 4 || valeur === null || typeof valeur !== 'object') return valeur;
  if (Array.isArray(valeur)) return valeur.slice(0, 50).map((v) => nettoyer(v, profondeur + 1));
  const sortie = {};
  for (const [c, v] of Object.entries(valeur)) {
    sortie[c] = INTERDITS.has(c) ? '[retiré]' : nettoyer(v, profondeur + 1);
  }
  return sortie;
}

function ecrire(evenement) {
  const ligne = JSON.stringify({
    date: new Date().toISOString(),
    ...nettoyer(evenement),
  });
  fs.mkdirSync(path.dirname(FICHIER), { recursive: true });
  fs.appendFileSync(FICHIER, `${ligne}\n`, { mode: 0o600 });
}

/** Consigne une action d'administration. */
function consigner(req, action, details = {}) {
  ecrire({
    action,
    administrateur: req.administrateur ? req.administrateur.identifiant : 'anonyme',
    ip: req.ip,
    resultat: 'ok',
    ...details,
  });
}

function consignerEchec(req, action, motif, details = {}) {
  ecrire({
    action,
    administrateur: req.administrateur ? req.administrateur.identifiant : 'anonyme',
    ip: req.ip,
    resultat: 'echec',
    motif,
    ...details,
  });
}

/** Les `limite` derniers événements, du plus récent au plus ancien. */
function lire(limite = 200) {
  let brut;
  try {
    brut = fs.readFileSync(FICHIER, 'utf8');
  } catch {
    return [];
  }
  const lignes = brut.split('\n').filter(Boolean);
  return lignes
    .slice(-limite)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean)
    .reverse();
}

module.exports = { consigner, consignerEchec, lire, ecrire };
