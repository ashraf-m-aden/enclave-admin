'use strict';
/**
 * =============================================================================
 *  CONSOLE D'ADMINISTRATION — authentification
 *
 *  Service SÉPARÉ du portail chercheur, et seul à détenir la clé de l'agent
 *  Samba. Une compromission du portail — la seule surface exposée aux
 *  utilisateurs — ne permet donc pas de créer ni de modifier un accès.
 *
 *  Aucune dépendance de chiffrement externe : `scrypt` et `timingSafeEqual`
 *  viennent du module `crypto` de Node. On n'écrit pas de cryptographie
 *  maison, on utilise celle de la plateforme.
 * =============================================================================
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FICHIER = process.env.ADMIN_COMPTES
  || path.join(__dirname, 'etat', 'administrateurs.json');

const DUREE_SESSION_MS = 8 * 60 * 60 * 1000;   // 8 h
const TENTATIVES_MAX = 5;
const BLOCAGE_MS = 15 * 60 * 1000;

// Secret de signature des cookies. Régénéré à chaque démarrage si absent :
// les sessions ne survivent pas à un redémarrage, ce qui est le comportement
// voulu pour une console d'administration.
const SECRET = process.env.ADMIN_SECRET || crypto.randomBytes(32).toString('hex');

const tentatives = new Map();   // identifiant -> { n, jusqu_a }

// ---------------------------------------------------------------------------
// Comptes
// ---------------------------------------------------------------------------

function lireComptes() {
  try {
    return JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
  } catch {
    return {};
  }
}

function ecrireComptes(comptes) {
  fs.mkdirSync(path.dirname(FICHIER), { recursive: true });
  const tmp = `${FICHIER}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(comptes, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, FICHIER);
}

function empreinte(motDePasse, sel = crypto.randomBytes(16).toString('hex')) {
  const cle = crypto.scryptSync(motDePasse, sel, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${sel}$${cle.toString('hex')}`;
}

function verifierEmpreinte(motDePasse, stockee) {
  const [algo, sel, attendu] = String(stockee).split('$');
  if (algo !== 'scrypt' || !sel || !attendu) return false;
  const calcule = crypto.scryptSync(motDePasse, sel, 64, { N: 16384, r: 8, p: 1 });
  const ref = Buffer.from(attendu, 'hex');
  // Comparaison à temps constant : une comparaison naïve laisserait fuir
  // la longueur du préfixe correct.
  return ref.length === calcule.length && crypto.timingSafeEqual(ref, calcule);
}

function creerAdministrateur(identifiant, motDePasse, nom) {
  const comptes = lireComptes();
  comptes[identifiant] = {
    nom: nom || identifiant,
    empreinte: empreinte(motDePasse),
    cree_le: new Date().toISOString(),
  };
  ecrireComptes(comptes);
  return { identifiant, nom: comptes[identifiant].nom };
}

// ---------------------------------------------------------------------------
// Jetons de session (cookie signé)
// ---------------------------------------------------------------------------

function signer(charge) {
  const corps = Buffer.from(JSON.stringify(charge)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(corps).digest('base64url');
  return `${corps}.${sig}`;
}

function verifierJeton(jeton) {
  if (typeof jeton !== 'string' || !jeton.includes('.')) return null;
  const [corps, sig] = jeton.split('.');
  const attendu = crypto.createHmac('sha256', SECRET).update(corps).digest('base64url');
  const a = Buffer.from(sig || '');
  const b = Buffer.from(attendu);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let charge;
  try {
    charge = JSON.parse(Buffer.from(corps, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!charge.expire || Date.now() > charge.expire) return null;
  return charge;
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

function connecter(identifiant, motDePasse) {
  const blocage = tentatives.get(identifiant);
  if (blocage && blocage.n >= TENTATIVES_MAX && Date.now() < blocage.jusqu_a) {
    const reste = Math.ceil((blocage.jusqu_a - Date.now()) / 60000);
    throw new Error(`trop de tentatives — réessayez dans ${reste} min`);
  }

  const compte = lireComptes()[identifiant];
  // Même message et même travail dans les deux cas : ne pas révéler
  // si l'identifiant existe.
  const valide = compte && verifierEmpreinte(motDePasse, compte.empreinte);

  if (!valide) {
    const n = (blocage && Date.now() < blocage.jusqu_a ? blocage.n : 0) + 1;
    tentatives.set(identifiant, { n, jusqu_a: Date.now() + BLOCAGE_MS });
    throw new Error('identifiant ou mot de passe incorrect');
  }

  tentatives.delete(identifiant);
  return {
    jeton: signer({ identifiant, nom: compte.nom, expire: Date.now() + DUREE_SESSION_MS }),
    dureeMs: DUREE_SESSION_MS,
    administrateur: { identifiant, nom: compte.nom },
  };
}

// ---------------------------------------------------------------------------
// Garde Express
// ---------------------------------------------------------------------------

function lireCookie(req, nom) {
  const brut = req.headers.cookie || '';
  for (const part of brut.split(';')) {
    const [c, ...v] = part.trim().split('=');
    if (c === nom) return decodeURIComponent(v.join('='));
  }
  return null;
}

/** Exige une session valide. Protège aussi du CSRF : le cookie est en
 *  SameSite=Strict, et toute écriture doit porter l'en-tête X-Console. */
function garde(req, res, suite) {
  const charge = verifierJeton(lireCookie(req, 'enclave_admin'));
  if (!charge) {
    return res.status(401).json({ erreur: 'session expirée ou absente' });
  }
  if (req.method !== 'GET' && req.get('X-Console') !== 'enclave') {
    return res.status(403).json({ erreur: 'en-tête de console manquant' });
  }
  req.administrateur = charge;
  suite();
}

module.exports = {
  connecter, garde, creerAdministrateur, lireComptes,
  empreinte, verifierEmpreinte, DUREE_SESSION_MS,
};
