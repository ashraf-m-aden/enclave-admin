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
  cree_le?: string
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
  /** Application lancée à l'ouverture de session. */
  application: string
}

/** Une application du catalogue de session. */
export interface Application {
  cle: string
  nom: string
  detail: string
  /** Réellement installée dans le modèle courant. */
  disponible: boolean
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
  compte?: string
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

/**
 * Les espaces d'un chercheur.
 *
 * `donnees` est en LECTURE pour la console comme pour le chercheur, mais
 * c'est le seul où l'administrateur puisse ÉCRIRE : déposer dans `travaux`
 * rendrait un fichier indiscernable du travail du chercheur, et déposer dans
 * `sorties` fausserait la piste de validation. L'agent refuse les deux.
 */
export type Espace = 'sorties' | 'travaux' | 'donnees'

/**
 * Demande de réinitialisation du second facteur d'un chercheur.
 *
 * Le secret TOTP n'apparaît jamais ici : la console ne le voit pas. Elle
 * reçoit seulement un ticket, à transmettre au chercheur hors bande.
 */
export interface DemandeReenrolement {
  identifiant: string
  motif: string | null
  demande_par: string
  demande_le: string
  /** `en-attente` tant qu'un second administrateur n'a pas approuvé. */
  etat: 'en-attente' | 'ticket-emis'
  double_controle: boolean
  approuve_par?: string | null
  approuve_le?: string
  /** Émis seulement après approbation. À dicter au chercheur. */
  ticket?: string
  expire_le?: string
  /** Le chercheur a-t-il été prévenu, hors bande ? */
  notifie?: boolean
  notifie_par?: string
  canal?: string | null
  etat_ticket?: { utilise: boolean; expire: boolean; expire_le: string } | null
}

/** État de l'enclave : ce que le tableau de bord affiche. */
export interface EtatEnclave {
  noeud: {
    nom?: string
    memoire_totale_go?: number
    memoire_utilisee_go?: number
    memoire_libre_go?: number
    memoire_pourcent?: number
    cpu_pourcent?: number
    cpu_coeurs?: number | null
    charge?: number | null
    uptime_h?: number
    erreur?: string
  } | null
  stockage: {
    nom?: string
    total_go?: number
    utilise_go?: number
    disponible_go?: number
    pourcent?: number
    erreur?: string
  } | null
  sessions: Array<{
    vmid: number
    nom: string
    statut: string
    uptime_s: number
    memoire_mo: number | null
    cpu_pourcent: number
    disque_mo: number | null
  }>
  capacite: {
    sessions_en_cours: number
    memoire_par_clone_mo: number
    cout_disque_par_clone_go: number
    /** Le plus bas des trois plafonds : c'est lui qui compte. */
    demarrables: number
    plafond_memoire: number
    plafond_stockage: number
    plafond_plage: number
    facteur_limitant: string
    limite_atteinte: boolean
    alerte_stockage: boolean
    alerte_memoire: boolean
  } | null
  surveillance: {
    sessions: Array<{
      vmid: number
      duree_s: number
      active: boolean
      derniere_activite_s: number | null
      debit_octets_min: number | null
    }>
    reglages: {
      inactivite_min: number
      accueil_min: number
      duree_max_h: number
      seuil_octets_min: number
    }
  } | null
}
