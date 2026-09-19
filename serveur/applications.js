'use strict';
/**
 * =============================================================================
 *  Catalogue des applications de session
 *
 *  Une session ouvre UNE application, sans bureau : pas de menu, pas de
 *  gestionnaire de fichiers, pas de terminal. C'est ce qui garde la surface
 *  reduite.
 *
 *  `disponible` dit si l'application est REELLEMENT installee dans le modele
 *  courant. Ce drapeau est maintenu a la main : installer Stata dans le
 *  modele ne le met pas a jour tout seul. Une application demandee mais
 *  absente ne casse pas la session — le modele affiche un message et ouvre
 *  RStudio a la place.
 * =============================================================================
 */

const fs = require('fs');
const path = require('path');

const FICHIER = process.env.ADMIN_APPLICATIONS
  || path.join(__dirname, 'etat', 'applications.json');

/** L'agent snippet applique la MEME liste blanche, de son cote. */
const CATALOGUE = [
  { cle: 'rstudio', nom: 'RStudio',          detail: 'R et RStudio Desktop',        disponible: true  },
  { cle: 'stata',   nom: 'Stata',            detail: 'Stata, version Linux native', disponible: false },
  { cle: 'spss',    nom: 'IBM SPSS Statistics', detail: 'SPSS Statistics',          disponible: false },
];

function lire() {
  try {
    return JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  } catch {
    // Premier demarrage : on depose le catalogue de reference.
    try {
      fs.mkdirSync(path.dirname(FICHIER), { recursive: true });
      fs.writeFileSync(FICHIER, JSON.stringify(CATALOGUE, null, 2), { mode: 0o600 });
    } catch { /* lecture seule : on se contente du catalogue en memoire */ }
    return CATALOGUE;
  }
}

/** Une cle connue du catalogue ? */
function valide(cle) {
  return lire().some((a) => a.cle === cle);
}

module.exports = { lire, valide, CATALOGUE };
