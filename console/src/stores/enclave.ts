/**
 * Données de l'enclave : accès, sessions, réconciliation, infrastructure.
 *
 * Chaque action porte son propre indicateur d'erreur : une panne de l'agent
 * Samba ne doit pas faire disparaître la liste des sessions, et inversement.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api'
import type { Acces, EtatEnclave, EvenementJournal, Infrastructure, Reconciliation, Session } from '@/types'

export const useEnclaveStore = defineStore('enclave', () => {
  const acces = ref<Acces[]>([])
  const sessions = ref<Session[]>([])
  const reconciliation = ref<Reconciliation | null>(null)
  const infrastructure = ref<Infrastructure | null>(null)
  const etatEnclave = ref<EtatEnclave | null>(null)
  const journal = ref<EvenementJournal[]>([])

  const chargement = ref(false)
  const erreur = ref<string | null>(null)

  const accesActifs = computed(() => acces.value.filter((a) => a.etat === 'actif'))
  const accesIncomplets = computed(() => acces.value.filter((a) => a.etat !== 'actif'))

  /** Nombre de lignes que la réconciliation signale à un humain. */
  const aSignaler = computed(() => {
    const r = reconciliation.value
    if (!r) return 0
    return r.orphelins.length + r.incomplets.length + r.desynchronises.length
  })

  function envelopper<T>(promesse: Promise<T>): Promise<T | null> {
    erreur.value = null
    return promesse.catch((e: Error) => {
      erreur.value = e.message
      return null
    })
  }

  async function chargerAcces() {
    const r = await envelopper(api.acces())
    if (r) acces.value = r.acces
  }

  async function chargerSessions() {
    const r = await envelopper(api.sessions())
    if (r) sessions.value = r.sessions
  }

  async function chargerReconciliation() {
    const r = await envelopper(api.reconciliation())
    if (r) reconciliation.value = r.rapport
  }

  async function chargerEtat() {
    const r = await envelopper(api.etat())
    if (r) etatEnclave.value = r
  }

  async function chargerInfrastructure() {
    const r = await envelopper(api.infrastructure())
    if (r) infrastructure.value = r
  }

  async function chargerJournal(limite = 200) {
    const r = await envelopper(api.journal(limite))
    if (r) journal.value = r.evenements
  }

  /** Vue d'ensemble : tout ce qu'affiche le tableau de bord. */
  async function toutCharger() {
    chargement.value = true
    try {
      await Promise.all([
        chargerAcces(), chargerSessions(), chargerEtat(),
      ])
    } finally {
      chargement.value = false
    }
  }

  return {
    acces, sessions, reconciliation, infrastructure, etatEnclave, journal,
    chargement, erreur,
    accesActifs, accesIncomplets, aSignaler,
    chargerAcces, chargerSessions, chargerReconciliation,
    chargerInfrastructure, chargerEtat, chargerJournal, toutCharger,
  }
})
