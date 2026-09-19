'use strict';
/**
 * =============================================================================
 *  CONSOLE D'ADMINISTRATION DE L'ENCLAVE — API
 *
 *  Service SÉPARÉ du portail chercheur. Il est le seul à détenir la clé de
 *  l'agent Samba, donc le seul à pouvoir créer ou modifier un accès. Le
 *  portail, lui, ne sait qu'ouvrir une session pour un accès déjà « actif ».
 *
 *  À n'exposer QUE sur le port d'administration, restreint par IP côté Nginx.
 *  Il écoute sur la boucle locale : c'est Nginx qui fait face au réseau.
 * =============================================================================
 */

const express = require('express');
const path = require('path');

const ORCHESTRATEUR = process.env.ORCHESTRATEUR_CHEMIN
  || '/opt/enclave/orchestrateur/services';

const provisionnement = require(path.join(ORCHESTRATEUR, 'provisionnement'));
const pve = require(path.join(ORCHESTRATEUR, 'proxmox'));
const session = require(path.join(ORCHESTRATEUR, 'session'));

const { connecter, garde, lireComptes } = require('./auth');
const journal = require('./journal');
const reenrolement = require('./reenrolement');
const applications = require('./applications');
const capacite = require('./capacite');

const app = express();
app.set('trust proxy', 'loopback');   // Nginx pose X-Forwarded-For
app.use(express.json({ limit: '64kb' }));

// La console est servie en statique par Nginx ; l'API ne répond qu'en JSON.
app.use((req, res, suite) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Cache-Control', 'no-store');
  suite();
});

/** Enveloppe une route async : sans cela, une promesse rejetée passe
 *  silencieusement et la requête reste pendante. */
const route = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    journal.consignerEchec(req, `${req.method} ${req.path}`, e.message);
    if (!res.headersSent) res.status(500).json({ erreur: e.message });
  });
};

// ---------------------------------------------------------------------------
// Session d'administration
// ---------------------------------------------------------------------------

app.post('/api/connexion', route(async (req, res) => {
  const { identifiant, motDePasse } = req.body || {};
  if (!identifiant || !motDePasse) {
    return res.status(400).json({ erreur: 'identifiant et mot de passe requis' });
  }
  try {
    const r = connecter(identifiant, motDePasse);
    res.cookie('enclave_admin', r.jeton, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: r.dureeMs,
      path: '/',
    });
    journal.ecrire({ action: 'connexion', administrateur: identifiant, ip: req.ip, resultat: 'ok' });
    res.json({ administrateur: r.administrateur });
  } catch (e) {
    journal.ecrire({ action: 'connexion', administrateur: identifiant, ip: req.ip, resultat: 'echec', motif: e.message });
    res.status(401).json({ erreur: e.message });
  }
}));

app.post('/api/deconnexion', garde, route(async (req, res) => {
  journal.consigner(req, 'deconnexion');
  res.clearCookie('enclave_admin', { path: '/' });
  res.json({ ok: true });
}));

app.get('/api/moi', garde, route(async (req, res) => {
  res.json({ administrateur: { identifiant: req.administrateur.identifiant, nom: req.administrateur.nom } });
}));

// ---------------------------------------------------------------------------
// Accès chercheurs
// ---------------------------------------------------------------------------

app.get('/api/acces', garde, route(async (req, res) => {
  const local = provisionnement.lireEtat();
  const acces = Object.entries(local).map(([identifiant, e]) => ({
    identifiant,
    etat: e.etat,
    mdp_pose_le: e.mdp_pose_le || null,
    auth_verifiee: e.auth_verifiee === true,
    provisionne_le: e.provisionne_le || e.demande_le || null,
    // Application lancée à l'ouverture de session.
    application: e.application || 'rstudio',
    // L'empreinte n'est JAMAIS renvoyée à la console.
  }));
  acces.sort((a, b) => a.identifiant.localeCompare(b.identifiant));
  res.json({ acces });
}));

/**
 * Provisionne un accès — ou change son mot de passe : c'est la même opération.
 * Un second chemin de code serait une seconde occasion de désynchroniser le
 * compte Samba et l'empreinte enregistrée.
 */
app.post('/api/acces', garde, route(async (req, res) => {
  const { identifiant, motDePasse } = req.body || {};
  if (!identifiant || !motDePasse) {
    return res.status(400).json({ erreur: 'identifiant et mot de passe requis' });
  }
  if (String(motDePasse).length < 12) {
    return res.status(400).json({ erreur: 'mot de passe trop court (12 caractères minimum)' });
  }

  const existait = provisionnement.estActif(identifiant);
  try {
    const acces = await provisionnement.provisionner({ username: identifiant, motDePasse });
    journal.consigner(req, existait ? 'changement-mot-de-passe' : 'provisionnement', { identifiant });
    res.json({
      acces: {
        identifiant,
        etat: acces.etat,
        mdp_pose_le: acces.mdp_pose_le,
        auth_verifiee: acces.auth_verifiee,
        provisionne_le: acces.provisionne_le,
      },
    });
  } catch (e) {
    journal.consignerEchec(req, existait ? 'changement-mot-de-passe' : 'provisionnement', e.message, { identifiant });
    res.status(502).json({ erreur: e.message });
  }
}));

/**
 * Révoque un accès. L'agent REFUSE de retirer un compte dont le dossier de
 * travail n'est pas vide : aucune révocation ne détruit du travail. Dans ce
 * cas la console affiche le refus, et un humain tranche.
 */
app.delete('/api/acces/:identifiant', garde, route(async (req, res) => {
  const { identifiant } = req.params;
  const retire = await provisionnement.compenser(identifiant);
  if (!retire) {
    journal.consignerEchec(req, 'revocation', 'refus de l’agent (dossier de travail non vide)', { identifiant });
    return res.status(409).json({
      erreur: "l'agent a refusé : le dossier de travail n'est pas vide. "
            + 'Le travail du chercheur doit être traité avant de révoquer.',
    });
  }
  journal.consigner(req, 'revocation', { identifiant });
  res.json({ ok: true });
}));

/** Catalogue des applications, avec leur disponibilité réelle dans le modèle. */
app.get('/api/applications', garde, route(async (req, res) => {
  res.json({ applications: applications.lire() });
}));

/**
 * Change l'application lancée à l'ouverture de session.
 *
 * Elle s'applique à la SESSION SUIVANTE : une session en cours n'est pas
 * interrompue. Le choix voyage ensuite jusqu'au clone par le snippet, où
 * l'agent le revalide contre sa propre liste blanche.
 */
app.patch('/api/acces/:identifiant/application', garde, route(async (req, res) => {
  const { identifiant } = req.params;
  const { application } = req.body || {};

  if (!applications.valide(application)) {
    return res.status(400).json({ erreur: 'application inconnue du catalogue' });
  }
  if (!provisionnement.estActif(identifiant)) {
    return res.status(409).json({ erreur: "cet accès n'est pas actif" });
  }

  provisionnement.definirApplication(identifiant, application);
  journal.consigner(req, 'changement-application', { identifiant, application });
  res.json({ identifiant, application });
}));

/**
 * Réconciliation : compare la base Samba au registre local.
 * SIGNALE, ne supprime jamais — une suppression automatique sur fausse
 * détection effacerait un accès légitime. Un humain tranche sur chaque ligne.
 */
app.get('/api/reconciliation', garde, route(async (req, res) => {
  const rapport = await provisionnement.reconcilier();
  res.json({ rapport });
}));

// ---------------------------------------------------------------------------
// Sessions vivantes
// ---------------------------------------------------------------------------

app.get('/api/sessions', garde, route(async (req, res) => {
  const clones = await pve.listerClones();
  const sessions = clones.map((c) => ({
    vmid: c.vmid,
    nom: c.name,
    statut: c.status,
    uptime_s: c.uptime || 0,
    memoire_mo: c.maxmem ? Math.round(c.maxmem / 1048576) : null,
  }));
  sessions.sort((a, b) => a.vmid - b.vmid);
  res.json({ sessions });
}));

/** Ferme une session : arrête le clone, le détruit, retire son snippet. */
app.delete('/api/sessions/:vmid', garde, route(async (req, res) => {
  const vmid = parseInt(req.params.vmid, 10);
  await session.fermerSession(vmid);
  journal.consigner(req, 'fermeture-session-forcee', { vmid });
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Infrastructure
// ---------------------------------------------------------------------------

/**
 * État complet de l'enclave : mémoire, stockage, sessions, capacité.
 * C'est la source du tableau de bord.
 */
app.get('/api/etat', garde, route(async (req, res) => {
  res.json(await capacite.etat());
}));

app.get('/api/infrastructure', garde, route(async (req, res) => {
  const clones = await pve.listerClones();
  // etat() refuse volontairement les VMID hors plage des clones : on passe
  // par etatModele(), en lecture seule et limitée au modèle configuré.
  let modele;
  try {
    const etat = await pve.etatModele(session.VMID_MODELE);
    modele = { vmid: session.VMID_MODELE, statut: etat.status, nom: etat.name || null };
  } catch (e) {
    modele = { vmid: session.VMID_MODELE, statut: 'introuvable', erreur: e.message };
  }
  res.json({
    modele,
    clones_actifs: clones.length,
    plage_clones: `${pve.CONFIG.vmidMin}-${pve.CONFIG.vmidMax}`,
    noeud: pve.CONFIG.node,
  });
}));


// ---------------------------------------------------------------------------
// Circuit de sortie — consultation et récupération des fichiers
//
// C'est la raison d'être de l'enclave : un administrateur habilité examine ce
// que le chercheur dépose dans « sorties », puis le transmet hors enclave.
// Rien ne sort autrement.
//
// La console ne touche jamais au serveur de fichiers : tout passe par l'agent
// contraint, qui valide l'espace et le nom de fichier et reconstruit le chemin
// lui-même.
// ---------------------------------------------------------------------------

/** Contenu d'un espace (`sorties` ou `travaux`) pour un chercheur. */
app.get('/api/fichiers/:identifiant/:espace', garde, route(async (req, res) => {
  const { identifiant, espace } = req.params;
  const r = await provisionnement.appelerAgent({
    action: 'lister-fichiers', username: identifiant, espace,
  });
  // Consulter « travaux » — l'espace privé du chercheur — est plus sensible
  // que consulter un dépôt destiné à la validation : on le trace à part.
  if (espace === 'travaux') {
    journal.consigner(req, 'consultation-travaux', { identifiant, nombre: r.fichiers.length });
  }
  res.json({ espace: r.espace, existe: r.existe, fichiers: r.fichiers });
}));

/**
 * Récupère un fichier. CHAQUE récupération est journalisée : c'est ce qui
 * permet de répondre, au dossier de conformité, à « qui a sorti quoi, et
 * quand ».
 */
app.get('/api/fichiers/:identifiant/:espace/:fichier', garde, route(async (req, res) => {
  const { identifiant, espace, fichier } = req.params;
  let r;
  try {
    r = await provisionnement.appelerAgent({
      action: 'lire-fichier', username: identifiant, espace, fichier,
    });
  } catch (e) {
    journal.consignerEchec(req, 'recuperation-fichier', e.message, { identifiant, espace, fichier });
    return res.status(404).json({ erreur: e.message });
  }

  journal.consigner(req, 'recuperation-fichier', {
    identifiant, espace, fichier, taille: r.taille,
  });

  const contenu = Buffer.from(r.contenu_b64, 'base64');
  // Type générique et téléchargement forcé : la console ne doit jamais
  // interpréter le contenu d'un fichier venu de l'enclave.
  res.set('Content-Type', 'application/octet-stream');
  res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(r.fichier)}"`);
  res.set('Content-Length', String(contenu.length));
  res.send(contenu);
}));


// ---------------------------------------------------------------------------
// Réinitialisation du second facteur
//
// Le second facteur est la dernière barrière qui empêche un administrateur
// d'usurper un compte chercheur : il peut déjà changer un mot de passe, mais
// il reste bloqué devant le code. Cette opération lui donne donc un pouvoir
// réel — d'où le double contrôle, le ticket daté et la notification.
//
// La console ne lit ni n'écrit jamais le secret TOTP : elle appelle une route
// du portail qui invalide et rend un ticket.
// ---------------------------------------------------------------------------

app.get('/api/reenrolement', garde, route(async (req, res) => {
  res.json({
    demandes: await reenrolement.lister(),
    double_controle: reenrolement.doubleControleApplicable(),
  });
}));

/** Premier temps : demander. Exécuté aussitôt s'il n'y a qu'un administrateur. */
app.post('/api/reenrolement', garde, route(async (req, res) => {
  const { identifiant, motif } = req.body || {};
  if (!identifiant) return res.status(400).json({ erreur: 'identifiant requis' });

  try {
    const d = await reenrolement.demander(identifiant, req.administrateur.identifiant, motif);
    journal.consigner(req, d.etat === 'ticket-emis'
      ? 'reinitialisation-second-facteur' : 'reinitialisation-demandee',
      { identifiant, motif: motif || null, double_controle: d.double_controle });
    res.json({ demande: d });
  } catch (e) {
    journal.consignerEchec(req, 'reinitialisation-demandee', e.message, { identifiant });
    res.status(409).json({ erreur: e.message });
  }
}));

/** Second temps : approuver. Un AUTRE administrateur, jamais le demandeur. */
app.post('/api/reenrolement/:identifiant/approuver', garde, route(async (req, res) => {
  const { identifiant } = req.params;
  try {
    const d = await reenrolement.approuver(identifiant, req.administrateur.identifiant);
    journal.consigner(req, 'reinitialisation-second-facteur', {
      identifiant, demande_par: d.demande_par, approuve_par: d.approuve_par,
    });
    res.json({ demande: d });
  } catch (e) {
    journal.consignerEchec(req, 'reinitialisation-approuvee', e.message, { identifiant });
    res.status(409).json({ erreur: e.message });
  }
}));

app.delete('/api/reenrolement/:identifiant', garde, route(async (req, res) => {
  const { identifiant } = req.params;
  try {
    reenrolement.annuler(identifiant);
    journal.consigner(req, 'reinitialisation-annulee', { identifiant });
    res.json({ ok: true });
  } catch (e) {
    res.status(409).json({ erreur: e.message });
  }
}));

/** Consigne la notification hors bande du chercheur, et par quel canal. */
app.post('/api/reenrolement/:identifiant/notifie', garde, route(async (req, res) => {
  const { identifiant } = req.params;
  const { canal } = req.body || {};
  try {
    const d = reenrolement.marquerNotifie(identifiant, req.administrateur.identifiant, canal);
    journal.consigner(req, 'chercheur-notifie', { identifiant, canal: canal || null });
    res.json({ demande: d });
  } catch (e) {
    res.status(409).json({ erreur: e.message });
  }
}));

// ---------------------------------------------------------------------------
// Journal d'audit
// ---------------------------------------------------------------------------

app.get('/api/journal', garde, route(async (req, res) => {
  const limite = Math.min(parseInt(req.query.limite, 10) || 200, 1000);
  res.json({ evenements: journal.lire(limite) });
}));

// ---------------------------------------------------------------------------

app.use((req, res) => res.status(404).json({ erreur: 'route inconnue' }));

const PORT = parseInt(process.env.ADMIN_PORT || '8090', 10);
// Boucle locale uniquement : Nginx fait face au réseau et restreint par IP.
const HOTE = process.env.ADMIN_HOTE || '127.0.0.1';

if (require.main === module) {
  if (Object.keys(lireComptes()).length === 0) {
    console.warn('[admin] aucun administrateur enregistré — lancer : node creer-admin.js <identifiant>');
  }
  app.listen(PORT, HOTE, () => {
    console.log(`[admin] console d'administration sur http://${HOTE}:${PORT}`);
  });
}

module.exports = app;
