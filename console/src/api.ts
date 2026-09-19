/**
 * Client de l'API d'administration.
 *
 * Le cookie de session est `httpOnly` : la console ne le lit jamais, le
 * navigateur le joint seul. Toute écriture porte l'en-tête `X-Console`, que le
 * serveur exige — c'est la protection contre le CSRF, en complément du
 * `SameSite=Strict` du cookie.
 */

import type {
  Acces, Administrateur, Espace, EvenementJournal, Fichier, Infrastructure,
  Reconciliation, Session,
} from '@/types'

export class ErreurApi extends Error {
  constructor(message: string, readonly statut: number) {
    super(message)
    this.name = 'ErreurApi'
  }
}

async function appeler<T>(chemin: string, options: RequestInit = {}): Promise<T> {
  const entetes: Record<string, string> = { 'X-Console': 'enclave' }
  if (options.body) entetes['Content-Type'] = 'application/json'

  let reponse: Response
  try {
    reponse = await fetch(`/api${chemin}`, {
      credentials: 'same-origin',
      ...options,
      headers: { ...entetes, ...(options.headers as Record<string, string>) },
    })
  } catch {
    throw new ErreurApi("le serveur d'administration ne répond pas", 0)
  }

  if (reponse.status === 204) return undefined as T

  let charge: unknown
  try {
    charge = await reponse.json()
  } catch {
    throw new ErreurApi(`réponse illisible (HTTP ${reponse.status})`, reponse.status)
  }

  if (!reponse.ok) {
    const message = (charge as { erreur?: string }).erreur || `erreur HTTP ${reponse.status}`
    throw new ErreurApi(message, reponse.status)
  }
  return charge as T
}

export const api = {
  // Session d'administration
  connexion: (identifiant: string, motDePasse: string) =>
    appeler<{ administrateur: Administrateur }>('/connexion', {
      method: 'POST',
      body: JSON.stringify({ identifiant, motDePasse }),
    }),

  deconnexion: () => appeler<{ ok: true }>('/deconnexion', { method: 'POST' }),

  moi: () => appeler<{ administrateur: Administrateur }>('/moi'),

  // Accès chercheurs
  acces: () => appeler<{ acces: Acces[] }>('/acces'),

  /** Provisionne un accès, ou change son mot de passe : même opération. */
  provisionner: (identifiant: string, motDePasse: string) =>
    appeler<{ acces: Acces }>('/acces', {
      method: 'POST',
      body: JSON.stringify({ identifiant, motDePasse }),
    }),

  revoquer: (identifiant: string) =>
    appeler<{ ok: true }>(`/acces/${encodeURIComponent(identifiant)}`, { method: 'DELETE' }),

  reconciliation: () => appeler<{ rapport: Reconciliation }>('/reconciliation'),

  // Sessions
  sessions: () => appeler<{ sessions: Session[] }>('/sessions'),

  fermerSession: (vmid: number) =>
    appeler<{ ok: true }>(`/sessions/${vmid}`, { method: 'DELETE' }),

  // Circuit de sortie
  fichiers: (identifiant: string, espace: Espace) =>
    appeler<{ espace: Espace; existe: boolean; fichiers: Fichier[] }>(
      `/fichiers/${encodeURIComponent(identifiant)}/${espace}`),

  /**
   * URL de récupération d'un fichier. On passe par une navigation du
   * navigateur plutôt que par `fetch` : le téléchargement garde ainsi son
   * nom de fichier, et le contenu ne transite pas par la mémoire de la page.
   */
  urlFichier: (identifiant: string, espace: Espace, fichier: string) =>
    `/api/fichiers/${encodeURIComponent(identifiant)}/${espace}/${encodeURIComponent(fichier)}`,

  // Supervision
  infrastructure: () => appeler<Infrastructure>('/infrastructure'),

  journal: (limite = 200) =>
    appeler<{ evenements: EvenementJournal[] }>(`/journal?limite=${limite}`),
}
