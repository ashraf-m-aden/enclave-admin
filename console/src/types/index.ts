/**
 * Types de l'API de la console.
 *
 * Note de sécurité : aucun type ne porte d'empreinte ni de mot de passe.
 * Le serveur ne les renvoie jamais, et la console n'a aucune raison de les
 * connaître.
 */

export interface Administrateur {
  identifiant: string
  nom: string
}

/** Un accès chercheur, tel que le registre local le décrit. */
export interface Acces {
  identifiant: string
  /** `actif` seul autorise l'ouverture d'une session. */
  etat: 'actif' | 'en-cours'
  /** `Password last set` relevé côté Samba, sert à détecter les écarts. */
  mdp_pose_le: string | null
  /** L'agent a vérifié que le mot de passe posé authentifie réellement. */
  auth_verifiee: boolean
  provisionne_le: string | null
}

/** Une session vivante, c'est-à-dire un clone jetable en cours. */
export interface Session {
  vmid: number
  nom: string
  statut: string
  uptime_s: number
  memoire_mo: number | null
}

/**
 * Rapport de réconciliation entre la base Samba et le registre local.
 * Il SIGNALE, il ne corrige rien : un humain tranche sur chaque ligne.
 */
export interface Reconciliation {
  /** Présents côté Samba, inconnus du registre. */
  orphelins: Array<{ username: string; mdp_pose_le: string | null }>
  /** Enregistrés mais pas `actif`, ou absents côté Samba. */
  incomplets: Array<{ username: string; etat?: string; detail?: string }>
  /** Mot de passe modifié hors de la procédure. */
  desynchronises: Array<{ username: string; attendu: string; constate: string }>
  coherents: string[]
}

export interface Infrastructure {
  modele: { vmid: number; statut: string; nom?: string | null; erreur?: string }
  clones_actifs: number
  plage_clones: string
  noeud: string
}

export interface EvenementJournal {
  date: string
  action: string
  administrateur: string
  ip?: string
  resultat: 'ok' | 'echec'
  motif?: string
  identifiant?: string
  vmid?: number
  espace?: string
  fichier?: string
  taille?: number
  nombre?: number
}

/** Un fichier déposé par un chercheur, vu depuis le circuit de sortie. */
export interface Fichier {
  nom: string
  taille: number
  /** Horodatage Unix, en secondes. */
  modifie_le: number
  dossier: boolean
  /** Faux si le fichier dépasse la taille que l'agent accepte de transmettre. */
  recuperable: boolean
}

export type Espace = 'sorties' | 'travaux'
