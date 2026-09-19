<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useEnclaveStore } from '@/stores/enclave'
import { duree } from '@/utils'

const enclave = useEnclaveStore()
let minuteur: number | undefined
const rafraichi = ref<Date | null>(null)

const etat = computed(() => enclave.etatEnclave)
const cap = computed(() => etat.value?.capacite ?? null)
const noeud = computed(() => etat.value?.noeud ?? null)
const stockage = computed(() => etat.value?.stockage ?? null)
const veille = computed(() => etat.value?.surveillance ?? null)

/** Ce que la surveillance sait d'une session donnée. */
function suivi(vmid: number) {
  return veille.value?.sessions.find((s) => s.vmid === vmid) ?? null
}

/**
 * Combien de minutes avant fermeture automatique pour inactivité.
 * Null quand la session est active ou pas encore mesurée.
 */
function avantFermeture(vmid: number): number | null {
  const s = suivi(vmid)
  const r = veille.value?.reglages
  if (!s || !r || s.derniere_activite_s === null) return null
  const reste = r.inactivite_min - Math.floor(s.derniere_activite_s / 60)
  return reste > 0 ? reste : 0
}

async function charger() {
  await enclave.chargerEtat()
  rafraichi.value = new Date()
}

onMounted(async () => {
  await Promise.all([charger(), enclave.chargerAcces(), enclave.chargerReconciliation()])
  minuteur = window.setInterval(charger, 15_000)
})

onUnmounted(() => window.clearInterval(minuteur))
</script>

<template>
  <div class="vue">
    <p v-if="enclave.erreur" class="message message--erreur" role="alert">
      {{ enclave.erreur }}
    </p>

    <!-- Alertes : ce qui demande une décision maintenant -->
    <p v-if="cap?.limite_atteinte" class="message message--erreur">
      <strong>Limite atteinte.</strong> Aucune nouvelle session ne peut démarrer —
      facteur limitant : {{ cap.facteur_limitant }}. Fermez des sessions ou
      libérez des ressources avant d'ouvrir un accès de plus.
    </p>
    <p v-else-if="cap && cap.demarrables <= 2" class="message message--alerte">
      <strong>Capacité presque atteinte :</strong> {{ cap.demarrables }} session(s)
      encore démarrable(s), limitées par {{ cap.facteur_limitant }}.
    </p>

    <!-- Chiffres clés -->
    <section class="chiffres">
      <article class="chiffre" :class="{ 'chiffre--alerte': cap?.limite_atteinte }">
        <p class="chiffre__valeur">{{ cap?.demarrables ?? '—' }}</p>
        <p class="chiffre__libelle">Sessions démarrables</p>
        <p v-if="cap" class="chiffre__detail">limitées par {{ cap.facteur_limitant }}</p>
      </article>

      <article class="chiffre">
        <p class="chiffre__valeur">{{ cap?.sessions_en_cours ?? 0 }}</p>
        <p class="chiffre__libelle">Sessions en cours</p>
        <p v-if="cap" class="chiffre__detail">{{ cap.memoire_par_clone_mo }} Mo chacune</p>
      </article>

      <article class="chiffre" :class="{ 'chiffre--alerte': cap?.alerte_memoire }">
        <p class="chiffre__valeur">{{ noeud?.memoire_pourcent ?? '—' }}<span class="unite">%</span></p>
        <p class="chiffre__libelle">Mémoire</p>
        <p v-if="noeud" class="chiffre__detail">
          {{ noeud.memoire_utilisee_go }} / {{ noeud.memoire_totale_go }} Go
        </p>
      </article>

      <article class="chiffre" :class="{ 'chiffre--alerte': cap?.alerte_stockage }">
        <p class="chiffre__valeur">{{ stockage?.pourcent ?? '—' }}<span class="unite">%</span></p>
        <p class="chiffre__libelle">Stockage</p>
        <p v-if="stockage" class="chiffre__detail">
          {{ stockage.disponible_go }} Go libres
        </p>
      </article>

      <article class="chiffre" :class="{ 'chiffre--alerte': enclave.aSignaler > 0 }">
        <p class="chiffre__valeur">{{ enclave.aSignaler }}</p>
        <p class="chiffre__libelle">Écarts à trancher</p>
        <p class="chiffre__detail">réconciliation</p>
      </article>
    </section>

    <!-- Les trois plafonds : montrer lequel serre -->
    <section v-if="cap" class="bloc">
      <h2>Ce qui limite la capacité</h2>
      <p class="bloc__aide">
        Trois plafonds s'appliquent en même temps ; c'est le plus bas qui décide.
      </p>

      <div class="plafonds">
        <article
          v-for="p in [
            { nom: 'Mémoire',  valeur: cap.plafond_memoire,  detail: `${noeud?.memoire_libre_go ?? '—'} Go libres` },
            { nom: 'Stockage', valeur: cap.plafond_stockage, detail: `${stockage?.disponible_go ?? '—'} Go libres` },
            { nom: 'Plage de VMID', valeur: cap.plafond_plage, detail: '1000 – 1099' },
          ]"
          :key="p.nom"
          class="plafond"
          :class="{ 'plafond--limitant': p.valeur === cap.demarrables }"
        >
          <p class="plafond__nom">{{ p.nom }}</p>
          <p class="plafond__valeur">{{ p.valeur }}</p>
          <p class="plafond__detail">{{ p.detail }}</p>
        </article>
      </div>
    </section>

    <!-- Ressources -->
    <section class="bloc">
      <h2>Ressources du serveur</h2>
      <div class="tableau-cadre">
        <table class="tableau">
          <tbody>
            <tr>
              <td>Mémoire</td>
              <td class="jauge-cellule">
                <div class="jauge">
                  <div
                    class="jauge__barre"
                    :class="{ 'jauge__barre--alerte': cap?.alerte_memoire }"
                    :style="{ width: `${noeud?.memoire_pourcent ?? 0}%` }"
                  ></div>
                </div>
              </td>
              <td class="mono num">
                {{ noeud?.memoire_utilisee_go }} / {{ noeud?.memoire_totale_go }} Go
              </td>
            </tr>
            <tr>
              <td>Stockage <span class="mono">{{ stockage?.nom }}</span></td>
              <td class="jauge-cellule">
                <div class="jauge">
                  <div
                    class="jauge__barre"
                    :class="{ 'jauge__barre--alerte': cap?.alerte_stockage }"
                    :style="{ width: `${stockage?.pourcent ?? 0}%` }"
                  ></div>
                </div>
              </td>
              <td class="mono num">
                {{ stockage?.utilise_go }} / {{ stockage?.total_go }} Go
              </td>
            </tr>
            <tr>
              <td>Processeur</td>
              <td class="jauge-cellule">
                <div class="jauge">
                  <div class="jauge__barre" :style="{ width: `${noeud?.cpu_pourcent ?? 0}%` }"></div>
                </div>
              </td>
              <td class="mono num">
                {{ noeud?.cpu_pourcent }} % · {{ noeud?.cpu_coeurs }} cœurs
              </td>
            </tr>
            <tr>
              <td>Nœud</td>
              <td class="mono" colspan="2">
                {{ noeud?.nom }} · en service depuis {{ noeud?.uptime_h }} h
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Sessions, avec leur fermeture automatique -->
    <section class="bloc">
      <div class="bloc__entete">
        <h2>Sessions en cours</h2>
        <RouterLink :to="{ name: 'sessions' }">Gérer</RouterLink>
      </div>

      <p v-if="veille" class="bloc__aide">
        Une session sans activité pendant
        <strong>{{ veille.reglages.inactivite_min }} minutes</strong> est fermée
        automatiquement, comme une session créée mais jamais utilisée au bout de
        {{ veille.reglages.accueil_min }} minutes. Durée maximale :
        {{ veille.reglages.duree_max_h }} h.
      </p>

      <div class="tableau-cadre">
        <p v-if="etat?.sessions.length === 0" class="vide">Aucune session ouverte.</p>

        <table v-else class="tableau">
          <thead>
            <tr>
              <th>VMID</th>
              <th>Session</th>
              <th>Durée</th>
              <th>Activité</th>
              <th>Fermeture auto.</th>
              <th>Mémoire</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in etat?.sessions" :key="s.vmid">
              <td class="mono">{{ s.vmid }}</td>
              <td class="mono">{{ s.nom }}</td>
              <td class="num">{{ duree(s.uptime_s) }}</td>
              <td>
                <span v-if="!suivi(s.vmid)" class="pastille pastille--neutre">mesure en cours</span>
                <span v-else-if="!suivi(s.vmid)!.active" class="pastille pastille--alerte">
                  jamais utilisée
                </span>
                <span v-else-if="(suivi(s.vmid)!.derniere_activite_s ?? 0) < 120"
                      class="pastille pastille--ok">active</span>
                <span v-else class="pastille pastille--alerte">
                  inactive {{ Math.floor((suivi(s.vmid)!.derniere_activite_s ?? 0) / 60) }} min
                </span>
              </td>
              <td class="num">
                <span v-if="avantFermeture(s.vmid) === null">—</span>
                <span v-else-if="avantFermeture(s.vmid)! <= 5" class="urgent">
                  dans {{ avantFermeture(s.vmid) }} min
                </span>
                <span v-else>dans {{ avantFermeture(s.vmid) }} min</span>
              </td>
              <td class="num">{{ s.memoire_mo }} Mo</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <p v-if="rafraichi" class="horodatage">
      Actualisé à {{ rafraichi.toLocaleTimeString('fr-FR') }} · rafraîchissement toutes les 15 s
    </p>
  </div>
</template>

<style scoped lang="scss">
.vue { display: flex; flex-direction: column; gap: $r-5; }

.chiffres {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(165px, 1fr));
  gap: $r-3;
}

.chiffre {
  @include carte;
  padding: $r-4;
  display: flex;
  flex-direction: column;
  gap: 1px;
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

  &__detail {
    font-size: 11.5px;
    color: $ink-3;
    margin-top: 2px;
  }

  .unite { font-size: 17px; font-weight: 600; margin-left: 1px; }
}

.bloc {
  display: flex;
  flex-direction: column;
  gap: $r-2;

  &__entete {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: $r-3;

    a { font-size: 13px; font-weight: 500; }
  }

  &__aide {
    font-size: 12.5px;
    color: $ink-3;
    max-width: 82ch;
    margin-bottom: $r-1;
  }
}

// ---------- plafonds ----------

.plafonds {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(175px, 1fr));
  gap: $r-3;
}

.plafond {
  @include carte;
  padding: $r-3 $r-4;
  display: flex;
  flex-direction: column;
  gap: 1px;

  // Le plafond qui serre porte le rouge de marque : c'est lui qu'il faut lire.
  &--limitant {
    border-color: $djib-red;
    background: $danger-bg;
  }

  &__nom { @include etiquette; }

  &__valeur {
    font-size: 21px;
    font-weight: 700;
    color: $djib-blue;
    font-variant-numeric: tabular-nums;
  }

  &__detail { font-size: 11.5px; color: $ink-3; }
}

// ---------- jauges ----------

.jauge-cellule { width: 42%; }

.jauge {
  height: 7px;
  background: $rule-soft;
  border-radius: 999px;
  overflow: hidden;

  &__barre {
    height: 100%;
    background: $djib-blue;
    border-radius: 999px;
    transition: width 0.4s ease;

    &--alerte { background: $djib-red; }
  }
}

.urgent { color: $danger; font-weight: 600; }

.horodatage {
  font-size: 11.5px;
  color: $ink-3;
  text-align: right;
}
</style>
