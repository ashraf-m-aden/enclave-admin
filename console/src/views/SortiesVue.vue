<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '@/api'
import { useEnclaveStore } from '@/stores/enclave'
import type { Espace, Fichier } from '@/types'

const enclave = useEnclaveStore()

const chercheur = ref('')
const espace = ref<Espace>('sorties')
const fichiers = ref<Fichier[]>([])
const existe = ref(true)
const chargement = ref(false)
const erreur = ref<string | null>(null)

/**
 * Les chercheurs à proposer. On part des accès enregistrés, et on ajoute les
 * orphelins repérés par la réconciliation : un compte révoqué peut avoir
 * laissé des résultats en attente de validation, et ceux-là doivent rester
 * consultables.
 */
const chercheurs = computed(() => {
  const noms = new Set(enclave.acces.map((a) => a.identifiant))
  for (const o of enclave.reconciliation?.orphelins ?? []) noms.add(o.username)
  return [...noms].sort()
})

const totalOctets = computed(() => fichiers.value.reduce((n, f) => n + f.taille, 0))

function taille(octets: number): string {
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

function dateFichier(horodatage: number): string {
  return new Date(horodatage * 1000).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

async function charger() {
  if (!chercheur.value) {
    fichiers.value = []
    return
  }
  chargement.value = true
  erreur.value = null
  try {
    const r = await api.fichiers(chercheur.value, espace.value)
    fichiers.value = r.fichiers
    existe.value = r.existe
  } catch (e) {
    erreur.value = (e as Error).message
    fichiers.value = []
  } finally {
    chargement.value = false
  }
}

/**
 * Le téléchargement passe par une navigation du navigateur : le fichier garde
 * son nom, et son contenu ne transite pas par la mémoire de la page. Chaque
 * récupération est journalisée côté serveur.
 */
function recuperer(f: Fichier) {
  window.location.href = api.urlFichier(chercheur.value, espace.value, f.nom)
}

watch([chercheur, espace], charger)

onMounted(async () => {
  await enclave.chargerAcces()
  if (!enclave.reconciliation) await enclave.chargerReconciliation()
  if (chercheurs.value.length > 0) chercheur.value = chercheurs.value[0]
})
</script>

<template>
  <div class="vue">
    <p v-if="erreur" class="message message--erreur" role="alert">{{ erreur }}</p>

    <p class="message message--info">
      Le chercheur dépose ses résultats dans <strong>sorties</strong>, en écriture
      aveugle : il ne peut ni les relister ni les rouvrir. C'est ici qu'ils sont
      examinés avant d'être transmis hors de l'enclave.
      <strong>Chaque récupération est consignée au journal d'audit.</strong>
    </p>

    <section class="filtres">
      <div class="champ">
        <label for="chercheur">Chercheur</label>
        <select id="chercheur" v-model="chercheur">
          <option v-if="chercheurs.length === 0" value="">Aucun chercheur</option>
          <option v-for="c in chercheurs" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>

      <div class="champ">
        <label for="espace">Espace</label>
        <select id="espace" v-model="espace">
          <option value="sorties">Sorties — dépôt à valider</option>
          <option value="travaux">Travaux — espace privé</option>
        </select>
      </div>

      <button type="button" class="btn btn--neutre" :disabled="chargement" @click="charger">
        {{ chargement ? 'Chargement…' : 'Rafraîchir' }}
      </button>
    </section>

    <p v-if="espace === 'travaux'" class="message message--alerte">
      <strong>Espace privé du chercheur.</strong> Consulter « travaux » n'est pas
      un acte de validation : ce dossier contient son travail en cours, pas des
      résultats soumis. Cette consultation est tracée.
    </p>

    <div class="tableau-cadre">
      <p v-if="!chercheur" class="vide">Choisissez un chercheur.</p>
      <p v-else-if="!existe" class="vide">
        Ce chercheur n'a pas de dossier « {{ espace }} » sur le serveur de fichiers.
      </p>
      <p v-else-if="fichiers.length === 0" class="vide">
        Aucun fichier déposé.
      </p>

      <table v-else class="tableau">
        <thead>
          <tr>
            <th>Fichier</th>
            <th>Taille</th>
            <th>Déposé le</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in fichiers" :key="f.nom">
            <td class="mono">
              {{ f.nom }}
              <span v-if="f.dossier" class="pastille pastille--neutre">dossier</span>
            </td>
            <td class="num">{{ f.dossier ? '—' : taille(f.taille) }}</td>
            <td class="mono">{{ dateFichier(f.modifie_le) }}</td>
            <td class="actions">
              <button
                v-if="f.recuperable"
                type="button"
                class="btn btn--neutre btn--petit"
                @click="recuperer(f)"
              >
                Récupérer
              </button>
              <span v-else-if="f.dossier" class="indispo">non récupérable</span>
              <span v-else class="indispo" title="Le fichier dépasse la taille transmissible par l'agent.">
                trop volumineux
              </span>
            </td>
          </tr>
        </tbody>
        <tfoot v-if="fichiers.length > 1">
          <tr>
            <td>{{ fichiers.length }} fichiers</td>
            <td class="num">{{ taille(totalOctets) }}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.vue { display: flex; flex-direction: column; gap: $r-4; }

.filtres {
  display: flex;
  align-items: flex-end;
  gap: $r-3;
  flex-wrap: wrap;

  .champ { min-width: 220px; }
  .btn { white-space: nowrap; }
}

.actions { text-align: right; white-space: nowrap; }

.indispo {
  font-size: 12px;
  color: $ink-3;
  font-style: italic;
}

.tableau tfoot td {
  @include etiquette;
  background: $blue-050;
  border-top: 1px solid $rule;
}

.pastille { margin-left: $r-2; }
</style>
