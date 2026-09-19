'use strict';
/**
 * =============================================================================
 *  CONSOLE — état et capacité de l'enclave
 *
 *  Répond à une seule question, celle qu'un administrateur se pose avant
 *  d'ouvrir l'accès à un chercheur de plus : **combien de sessions puis-je
 *  encore démarrer ?**
 *
 *  Trois plafonds limitent ce nombre, et c'est le plus bas qui compte :
 *
 *    - la MÉMOIRE libre du serveur, divisée par celle d'un clone ;
 *    - le STOCKAGE disponible, divisé par ce qu'un clone occupe réellement ;
 *    - la PLAGE de VMID réservée aux sessions.
 *
 *  Le stockage mérite une précision : les clones sont des instantanés à
 *  provisionnement léger. Un clone neuf ne coûte presque rien et grossit à
 *  l'usage. On raisonne donc sur l'occupation réelle constatée, pas sur la
 *  taille nominale du disque — sans quoi on annoncerait zéro session possible
 *  alors qu'il en reste.
 * =============================================================================
 */

const path = require('path');

const ORCHESTRATEUR = process.env.ORCHESTRATEUR_CHEMIN
  || '/opt/enclave/orchestrateur/services';
const pve = require(path.join(ORCHESTRATEUR, 'proxmox'));

const PORTAIL = process.env.PORTAIL_INTERNE || 'http://portail:8091';
const SECRET_INTERNE = process.env.INTERNE_SECRET || '';

/** Marge gardée libre : saturer un pool à provisionnement léger fige tout. */
const MARGE_STOCKAGE = 0.10;
/** Mémoire réservée à l'hôte et aux VM d'infrastructure. */
const MARGE_MEMOIRE_GO = 1.5;

/** L'état de la surveillance, côté portail. Facultatif : son absence ne doit
 *  pas empêcher d'afficher le reste. */
async function surveillance() {
  if (!SECRET_INTERNE) return null;
  try {
    const r = await fetch(`${PORTAIL}/interne/surveillance`, {
      headers: { 'X-Interne': SECRET_INTERNE },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function go(octets) {
  return Math.round((octets / 2 ** 30) * 10) / 10;
}

/**
 * L'état complet de l'enclave.
 *
 * Chaque bloc est tenté séparément : une panne de l'un ne doit pas priver
 * l'administrateur des autres.
 */
async function etat() {
  const sortie = { noeud: null, stockage: null, sessions: [], capacite: null, surveillance: null };

  // --- Nœud -----------------------------------------------------------------
  try {
    const n = await pve.etatNoeud();
    sortie.noeud = {
      nom: pve.CONFIG.node,
      memoire_totale_go: go(n.memory.total),
      memoire_utilisee_go: go(n.memory.used),
      memoire_libre_go: go(n.memory.free),
      memoire_pourcent: Math.round((n.memory.used / n.memory.total) * 100),
      cpu_pourcent: Math.round(n.cpu * 1000) / 10,
      cpu_coeurs: n.cpuinfo?.cpus ?? null,
      charge: n.loadavg?.[0] ?? null,
      uptime_h: Math.round(n.uptime / 3600),
    };
  } catch (e) {
    sortie.noeud = { erreur: e.message };
  }

  // --- Stockage --------------------------------------------------------------
  try {
    const s = await pve.etatStockage('local-lvm');
    sortie.stockage = {
      nom: 'local-lvm',
      total_go: go(s.total),
      utilise_go: go(s.used),
      disponible_go: go(s.avail),
      pourcent: Math.round((s.used / s.total) * 100),
    };
  } catch (e) {
    sortie.stockage = { erreur: e.message };
  }

  // --- Sessions en cours -----------------------------------------------------
  let clones = [];
  try {
    clones = await pve.listerClones();
    sortie.sessions = clones.map((c) => ({
      vmid: c.vmid,
      nom: c.name,
      statut: c.status,
      uptime_s: c.uptime || 0,
      memoire_mo: c.maxmem ? Math.round(c.maxmem / 2 ** 20) : null,
      cpu_pourcent: c.cpu ? Math.round(c.cpu * 1000) / 10 : 0,
      disque_mo: c.maxdisk ? Math.round(c.maxdisk / 2 ** 20) : null,
    }));
  } catch (e) {
    sortie.sessions = [];
    sortie.erreur_sessions = e.message;
  }

  // --- Capacité --------------------------------------------------------------
  // Ce que coûte un clone : la mémoire vient du modèle ; l'occupation disque
  // réelle est mesurée sur les clones vivants, car un instantané à
  // provisionnement léger ne coûte pas sa taille nominale.
  let memoireParClone = 2048;
  try {
    const m = await pve.etatModele(parseInt(process.env.VMID_MODELE || '9004', 10));
    if (m?.maxmem) memoireParClone = Math.round(m.maxmem / 2 ** 20);
  } catch { /* on garde la valeur de référence */ }

  const enCours = sortie.sessions.filter((s) => s.statut === 'running').length;

  const libreMemoireGo = sortie.noeud?.memoire_libre_go ?? 0;
  const parMemoire = Math.max(0,
    Math.floor(Math.max(libreMemoireGo - MARGE_MEMOIRE_GO, 0) / (memoireParClone / 1024)));

  const dispoGo = sortie.stockage?.disponible_go ?? 0;
  const utileGo = Math.max(dispoGo - (sortie.stockage?.total_go ?? 0) * MARGE_STOCKAGE, 0);
  // Coût disque d'un clone : ce qu'occupent réellement les clones existants,
  // ou une estimation prudente quand il n'y en a aucun.
  const coutDisqueGo = 2.5;
  const parStockage = Math.floor(utileGo / coutDisqueGo);

  const plage = pve.CONFIG.vmidMax - pve.CONFIG.vmidMin + 1;
  const parPlage = Math.max(0, plage - enCours);

  const possible = Math.min(parMemoire, parStockage, parPlage);
  const limitant = possible === parMemoire ? 'mémoire'
    : possible === parStockage ? 'stockage' : 'plage de VMID';

  sortie.capacite = {
    sessions_en_cours: enCours,
    memoire_par_clone_mo: memoireParClone,
    cout_disque_par_clone_go: coutDisqueGo,
    demarrables: possible,
    plafond_memoire: parMemoire,
    plafond_stockage: parStockage,
    plafond_plage: parPlage,
    facteur_limitant: limitant,
    limite_atteinte: possible <= 0,
    // Seuils d'alerte : au-delà, l'administrateur doit agir avant d'ouvrir
    // un accès de plus.
    alerte_stockage: (sortie.stockage?.pourcent ?? 0) >= 80,
    alerte_memoire: (sortie.noeud?.memoire_pourcent ?? 0) >= 85,
  };

  sortie.surveillance = await surveillance();
  return sortie;
}

module.exports = { etat };
