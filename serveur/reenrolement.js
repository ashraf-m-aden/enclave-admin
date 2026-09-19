'use strict';
/**
 * =============================================================================
 *  CONSOLE — réinitialisation du second facteur d'un chercheur
 *
 *  CE QUE CE POUVOIR VAUT RÉELLEMENT. Le second facteur est la dernière
 *  barrière qui empêche un administrateur d'usurper un compte chercheur : il
 *  peut déjà changer un mot de passe, mais il reste bloqué devant le code.
 *  Pouvoir le réinitialiser, c'est pouvoir prendre l'identité d'un chercheur
 *  et accéder à ses données. Ce n'est pas une opération de confort.
 *
 *  Quatre contrôles l'encadrent, et aucun ne suffit seul :
 *
 *    1. DOUBLE CONTRÔLE — deux administrateurs distincts, dès que deux
 *       comptes existent. Empêche l'acte unilatéral.
 *    2. TICKET daté, à usage unique — le chercheur en a besoin EN PLUS de son
 *       mot de passe pour réenrôler. Borne la fenêtre d'exposition.
 *    3. NOTIFICATION HORS BANDE au chercheur — le seul contrôle qui détecte
 *       une réinitialisation qu'il n'a pas demandée.
 *    4. TRACE au journal — qui a demandé, qui a approuvé, qui a notifié.
 *
 *  La console ne lit ni n'écrit JAMAIS le secret TOTP. Elle appelle une route
 *  du portail qui invalide et rend un ticket ; le secret reste du seul
 *  ressort du portail.
 * =============================================================================
 */

const fs = require('fs');
const path = require('path');

const { lireComptes } = require('./auth');

const PORTAIL = process.env.PORTAIL_INTERNE || 'http://portail:8091';
const SECRET_INTERNE = process.env.INTERNE_SECRET || '';
const FICHIER = process.env.ADMIN_DEMANDES
  || path.join(__dirname, 'etat', 'demandes-reenrolement.json');

/** Au-delà, une demande non approuvée est caduque : on ne laisse pas une
 *  demande sensible en attente indéfinie. */
const PEREMPTION_MS = 24 * 60 * 60 * 1000;

function lire() {
  try {
    return JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  } catch {
    return {};
  }
}

function ecrire(demandes) {
  fs.mkdirSync(path.dirname(FICHIER), { recursive: true });
  const tmp = `${FICHIER}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(demandes, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FICHIER);
}

/** Le double contrôle n'a de sens que si deux administrateurs existent. */
function doubleControleApplicable() {
  return Object.keys(lireComptes()).length >= 2;
}

async function appelerPortail(chemin, options = {}) {
  if (!SECRET_INTERNE) {
    throw new Error('INTERNE_SECRET absent : la console ne peut pas joindre le portail');
  }
  const entetes = { 'X-Interne': SECRET_INTERNE };
  if (options.body) entetes['Content-Type'] = 'application/json';

  let reponse;
  try {
    reponse = await fetch(`${PORTAIL}${chemin}`, { ...options, headers: entetes });
  } catch (e) {
    throw new Error(`portail injoignable : ${e.message}`);
  }
  const charge = await reponse.json().catch(() => ({}));
  if (!reponse.ok) throw new Error(charge.erreur || `portail : HTTP ${reponse.status}`);
  return charge;
}

// ---------------------------------------------------------------------------

/** Purge les demandes périmées. */
function nettoyer(demandes) {
  const limite = Date.now() - PEREMPTION_MS;
  let modifie = false;
  for (const [k, d] of Object.entries(demandes)) {
    if (d.etat === 'en-attente' && Date.parse(d.demande_le) < limite) {
      delete demandes[k];
      modifie = true;
    }
  }
  return modifie;
}

/**
 * Premier temps : un administrateur demande la réinitialisation.
 *
 * S'il est seul administrateur, la demande est exécutée immédiatement — en le
 * signalant, car le double contrôle ne s'applique alors pas.
 */
async function demander(identifiant, administrateur, motif) {
  const demandes = lire();
  nettoyer(demandes);

  if (demandes[identifiant] && demandes[identifiant].etat === 'en-attente') {
    throw new Error('une demande est déjà en attente pour ce compte');
  }

  const demande = {
    identifiant,
    motif: motif || null,
    demande_par: administrateur,
    demande_le: new Date().toISOString(),
    etat: 'en-attente',
  };

  if (!doubleControleApplicable()) {
    // Un seul administrateur : le double contrôle est impossible. On exécute,
    // mais la demande porte la trace de cette exception.
    const r = await appelerPortail('/interne/reenrolement', {
      method: 'POST',
      body: JSON.stringify({ identifiant, demandePar: administrateur }),
    });
    Object.assign(demande, {
      etat: 'ticket-emis',
      approuve_par: null,
      double_controle: false,
      ticket: r.ticket,
      expire_le: r.expire_le,
      notifie: false,
    });
    demandes[identifiant] = demande;
    ecrire(demandes);
    return demande;
  }

  demande.double_controle = true;
  demandes[identifiant] = demande;
  ecrire(demandes);
  return demande;
}

/**
 * Second temps : un AUTRE administrateur approuve. C'est ce refus de
 * l'auto-approbation qui fait le double contrôle.
 */
async function approuver(identifiant, administrateur) {
  const demandes = lire();
  const d = demandes[identifiant];
  if (!d || d.etat !== 'en-attente') {
    throw new Error('aucune demande en attente pour ce compte');
  }
  if (d.demande_par === administrateur) {
    throw new Error('un second administrateur doit approuver : '
      + 'le demandeur ne peut pas approuver sa propre demande');
  }

  const r = await appelerPortail('/interne/reenrolement', {
    method: 'POST',
    body: JSON.stringify({ identifiant, demandePar: d.demande_par, approuvePar: administrateur }),
  });

  Object.assign(d, {
    etat: 'ticket-emis',
    approuve_par: administrateur,
    approuve_le: new Date().toISOString(),
    ticket: r.ticket,
    expire_le: r.expire_le,
    notifie: false,
  });
  ecrire(demandes);
  return d;
}

/** Annule une demande en attente. */
function annuler(identifiant) {
  const demandes = lire();
  const d = demandes[identifiant];
  if (!d || d.etat !== 'en-attente') throw new Error('aucune demande en attente');
  delete demandes[identifiant];
  ecrire(demandes);
  return true;
}

/**
 * Consigne que le chercheur a été prévenu, hors bande, et par quel canal.
 *
 * C'est le contrôle le plus efficace du dispositif : un chercheur averti d'une
 * réinitialisation qu'il n'a pas demandée détecte immédiatement l'abus. Tant
 * que cette confirmation n'est pas posée, la console affiche la demande comme
 * incomplète.
 */
function marquerNotifie(identifiant, administrateur, canal) {
  const demandes = lire();
  const d = demandes[identifiant];
  if (!d || d.etat !== 'ticket-emis') throw new Error('aucun ticket à notifier');

  d.notifie = true;
  d.notifie_par = administrateur;
  d.notifie_le = new Date().toISOString();
  d.canal = canal || null;
  ecrire(demandes);
  return d;
}

/** Les demandes, enrichies de l'état réel du ticket côté portail. */
async function lister() {
  const demandes = lire();
  if (nettoyer(demandes)) ecrire(demandes);

  const sortie = [];
  for (const d of Object.values(demandes)) {
    let etatTicket = null;
    if (d.etat === 'ticket-emis') {
      try {
        const r = await appelerPortail(`/interne/reenrolement/${encodeURIComponent(d.identifiant)}`);
        etatTicket = r.ticket;
      } catch {
        // Le portail peut être indisponible : la demande reste affichable.
      }
    }
    sortie.push({ ...d, etat_ticket: etatTicket });
  }
  sortie.sort((a, b) => (b.demande_le || '').localeCompare(a.demande_le || ''));
  return sortie;
}

/**
 * Efface le second facteur d'un compte dont l'acces vient d'etre revoque.
 *
 * La console ne lit ni n'ecrit JAMAIS un secret TOTP : elle demande au
 * portail, seul proprietaire, de le detruire. La separation tient.
 *
 * Ne leve pas si le portail est injoignable : une revocation d'acces ne doit
 * pas echouer a cause de cela — le compte Samba et le registre sont deja
 * retires, ce qui suffit a bloquer l'acces. L'echec est signale a l'appelant
 * pour qu'il le porte au journal.
 *
 * @returns {{ok: boolean, efface?: boolean, erreur?: string}}
 */
async function purgerSecondFacteur(identifiant) {
  try {
    const r = await appelerPortail(
      `/interne/second-facteur/${encodeURIComponent(identifiant)}`,
      { method: 'DELETE' });
    return { ok: true, efface: r.efface === true };
  } catch (e) {
    return { ok: false, erreur: e.message };
  }
}

module.exports = {
  purgerSecondFacteur,
  demander, approuver, annuler, marquerNotifie, lister,
  doubleControleApplicable, PEREMPTION_MS,
};
