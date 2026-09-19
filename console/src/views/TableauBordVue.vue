<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useEnclaveStore } from '@/stores/enclave'
import { duree } from '@/utils'

const enclave = useEnclaveStore()
let minuteur: number | undefined

const modeleEnLigne = computed(() => {
  const m = enclave.infrastructure?.modele
  return !!m && m.statut !== 'introuvable'
})

onMounted(async () => {
  await enclave.toutCharger()
  await enclave.chargerReconciliation()
  // Les sessions bougent : on les rafraîchit sans recharger toute la page.
  minuteur = window.setInterval(() => enclave.chargerSessions(), 20_000)
})

onUnmounted(() => window.clearInterval(minuteur))
</script>

<template>
  <div class="vue">
    <p v-if="enclave.erreur" class="message message--erreur" role="alert">
      {{ enclave.erreur }}
    </p>

    <section class="chiffres">
      <article class="chiffre">
        <p class="chiffre__valeur">{{ enclave.accesActifs.length }}</p>
        <p class="chiffre__libelle">Accès actifs</p>
      </article>

      <article class="chiffre" :class="{ 'chiffre--alerte': enclave.accesIncomplets.length > 0 }">
        <p class="chiffre__valeur">{{ enclave.accesIncomplets.length }}</p>
        <p class="chiffre__libelle">Accès incomplets</p>
      </article>

      <article class="chiffre">
        <p class="chiffre__valeur">{{ enclave.sessions.length }}</p>
        <p class="chiffre__libelle">Sessions en cours</p>
      </article>

      <article class="chiffre" :class="{ 'chiffre--alerte': enclave.aSignaler > 0 }">
        <p class="chiffre__valeur">{{ enclave.aSignaler }}</p>
        <p class="chiffre__libelle">Écarts à trancher</p>
      </article>
    </section>

    <section class="bloc">
      <h2>Infrastructure</h2>
      <div class="tableau-cadre">
        <table class="tableau">
          <tbody>
            <tr>
              <td>Modèle de référence</td>
              <td class="mono">{{ enclave.infrastructure?.modele.vmid ?? '—' }}</td>
              <td>
                <span v-if="modeleEnLigne" class="pastille pastille--ok">
                  {{ enclave.infrastructure?.modele.statut }}
                </span>
                <span v-else class="pastille pastille--danger">introuvable</span>
              </td>
            </tr>
            <tr>
              <td>Nœud Proxmox</td>
              <td class="mono" colspan="2">{{ enclave.infrastructure?.noeud ?? '—' }}</td>
            </tr>
            <tr>
              <td>Plage des clones</td>
              <td class="mono" colspan="2">{{ enclave.infrastructure?.plage_clones ?? '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="bloc">
      <div class="bloc__entete">
        <h2>Sessions en cours</h2>
        <RouterLink :to="{ name: 'sessions' }">Tout voir</RouterLink>
      </div>

      <div v-if="enclave.sessions.length === 0" class="tableau-cadre">
        <p class="vide">Aucune session ouverte.</p>
      </div>

      <div v-else class="tableau-cadre">
        <table class="tableau">
          <thead>
            <tr>
              <th>VMID</th>
              <th>Session</th>
              <th>État</th>
              <th>Durée</th>
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
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="enclave.aSignaler > 0" class="bloc">
      <div class="bloc__entete">
        <h2>Écarts signalés</h2>
        <RouterLink :to="{ name: 'reconciliation' }">Examiner</RouterLink>
      </div>
      <p class="message message--alerte">
        La réconciliation signale {{ enclave.aSignaler }} ligne(s) à examiner.
        Elle ne corrige rien d'elle-même : chaque écart demande une décision.
      </p>
    </section>
  </div>
</template>

<style scoped lang="scss">
.vue { display: flex; flex-direction: column; gap: $r-5; }

.chiffres {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: $r-3;
}

.chiffre {
  @include carte;
  padding: $r-4;
  display: flex;
  flex-direction: column;
  gap: 2px;
  // Filet de gauche : neutre par défaut, rouge quand une décision est due.
  border-left: 3px solid $rule;

  &--alerte { border-left-color: $djib-red; }

  &__valeur {
    font-size: 28px;
    font-weight: 700;
    line-height: 1.1;
    color: $djib-blue;
    font-variant-numeric: tabular-nums;
  }

  &__libelle { @include etiquette; }
}

.bloc {
  display: flex;
  flex-direction: column;
  gap: $r-3;

  &__entete {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: $r-3;

    a { font-size: 13px; font-weight: 500; }
  }
}
</style>
