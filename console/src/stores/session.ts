/** État de la session d'administration. */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ErreurApi } from '@/api'
import type { Administrateur } from '@/types'

export const useSessionStore = defineStore('session', () => {
  const administrateur = ref<Administrateur | null>(null)
  const chargement = ref(false)
  const verifie = ref(false)

  async function verifier() {
    try {
      const { administrateur: a } = await api.moi()
      administrateur.value = a
    } catch {
      administrateur.value = null
    } finally {
      verifie.value = true
    }
  }

  async function connecter(identifiant: string, motDePasse: string) {
    chargement.value = true
    try {
      const { administrateur: a } = await api.connexion(identifiant, motDePasse)
      administrateur.value = a
    } finally {
      chargement.value = false
    }
  }

  async function deconnecter() {
    try {
      await api.deconnexion()
    } catch (e) {
      // Une session déjà expirée n'est pas une erreur à signaler.
      if (!(e instanceof ErreurApi) || e.statut !== 401) throw e
    } finally {
      administrateur.value = null
    }
  }

  return { administrateur, chargement, verifie, verifier, connecter, deconnecter }
})
