<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { api } from '@/api'
import { useEnclaveStore } from '@/stores/enclave'
import { duree } from '@/utils'
import type { Session } from '@/types'

const enclave = useEnclaveStore()
const erreur = ref<string | null>(null)
const enFermeture = ref<number | null>(null)
let minuteur: number | undefined

/**
 * Fermer une session détruit le clone et retire son snippet. Le travail du
 * chercheur n'est pas touché : il vit sur le serveur de fichiers, pas sur le
 * clone. Mais ce qui n'a pas été enregistré est perdu — d'où la confirmation.
 */
async function fermer(s: Session) {
  const sur = window.confirm(
    `Fermer la session ${s.nom} (VMID ${s.vmid}) ?\n\n`
    + 'Le clone est détruit immédiatement. Les fichiers enregistrés dans '
    + "« travaux » sont conservés sur le serveur de fichiers ; tout travail "
    + 'non enregistré est perdu.',
  )
  if (!sur) return

  erreur.value = null
  enFermeture.value = s.vmid
  try {
    await api.fermerSession(s.vmid)
    await enclave.chargerSessions()
  } catch (e) {
    erreur.value = (e as Error).message
  } finally {
    enFermeture.value = null
  }
}

onMounted(async () => {
  await enclave.chargerSessions()
  minuteur = window.setInterval(() => enclave.chargerSessions(), 15_000)
})

onUnmounted(() => window.clearInterval(minuteur))
</script>

<template>
  <div class="vue">
    <p v-if="erreur" class="message message--erreur" role="alert">{{ erreur }}</p>

    <p class="message message--info">
      Un clone est créé à la connexion et détruit à la déconnexion. Les travaux
      vivent sur le serveur de fichiers : ils survivent à la destruction.
    </p>

    <div class="tableau-cadre">
      <p v-if="enclave.sessions.length === 0" class="vide">
        Aucune session ouverte.
      </p>

      <table v-else class="tableau">
        <thead>
          <tr>
            <th>VMID</th>
            <th>Nom du clone</th>
            <th>État</th>
            <th>Durée</th>
            <th>Mémoire</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in enclave.sessions" :key="s.vmid">
            <td class="mono">{{ s.vmid }}</td>
            <td class="mono">{{ s.nom }}</td>
            <td>
              <span class="pastille" :class="s.statut === 'running' ? 'pastille--ok' : 'pastille--neutre'">
                {{ s.statut }}
              </span>
            </td>
            <td class="num">{{ duree(s.uptime_s) }}</td>
            <td class="num">{{ s.memoire_mo ? `${s.memoire_mo} Mo` : '—' }}</td>
            <td class="actions">
              <button
                type="button"
                class="btn btn--danger btn--petit"
                :disabled="enFermeture === s.vmid"
                @click="fermer(s)"
              >
                {{ enFermeture === s.vmid ? 'Fermeture…' : 'Fermer' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.vue { display: flex; flex-direction: column; gap: $r-4; }

.actions { text-align: right; white-space: nowrap; }
</style>
