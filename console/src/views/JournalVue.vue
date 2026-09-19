<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useEnclaveStore } from '@/stores/enclave'
import { dateCourte } from '@/utils'
import type { EvenementJournal } from '@/types'

const enclave = useEnclaveStore()
const filtre = ref('')

const evenements = computed(() => {
  const f = filtre.value.trim().toLowerCase()
  if (!f) return enclave.journal
  return enclave.journal.filter((e) =>
    [e.action, e.administrateur, e.identifiant, e.motif, e.fichier, String(e.vmid ?? '')]
      .some((champ) => champ?.toLowerCase().includes(f)))
})

/** Libellés lisibles : le journal est lu par des humains, pas par des machines. */
const libelles: Record<string, string> = {
  'connexion': 'Connexion à la console',
  'deconnexion': 'Déconnexion',
  'provisionnement': "Création d'un accès",
  'changement-mot-de-passe': 'Changement de mot de passe',
  'revocation': "Révocation d'un accès",
  'fermeture-session-forcee': 'Fermeture forcée de session',
  'recuperation-fichier': "Récupération d'un fichier",
  'consultation-travaux': "Consultation de l'espace privé",
  'reinitialisation-demandee': 'Réinitialisation demandée',
  'reinitialisation-second-facteur': 'RÉINITIALISATION DU SECOND FACTEUR',
  'reinitialisation-annulee': 'Réinitialisation annulée',
  'chercheur-notifie': 'Chercheur notifié',
  'changement-application': "Changement d'application",
}

function libelle(action: string) {
  return libelles[action] || action
}

/** Ce sur quoi l'action a porté : un accès, un clone, ou un fichier. */
function objet(e: EvenementJournal) {
  if (e.fichier) return `${e.identifiant} · ${e.espace}/${e.fichier}`
  if (e.identifiant) return e.identifiant
  if (e.vmid) return `VMID ${e.vmid}`
  return '—'
}

onMounted(() => enclave.chargerJournal(500))
</script>

<template>
  <div class="vue">
    <p v-if="enclave.erreur" class="message message--erreur" role="alert">
      {{ enclave.erreur }}
    </p>

    <section class="entete">
      <p class="message message--info">
        Journal en ajout seul. Aucun mot de passe, aucune empreinte et aucun
        jeton n'y sont écrits. Il fait partie du dossier de conformité.
      </p>
      <div class="champ">
        <label for="filtre" class="sr">Filtrer</label>
        <input id="filtre" v-model="filtre" type="search" placeholder="Filtrer…" />
      </div>
    </section>

    <div class="tableau-cadre">
      <p v-if="evenements.length === 0" class="vide">
        {{ enclave.journal.length === 0 ? 'Aucun événement consigné.' : 'Aucun événement ne correspond.' }}
      </p>

      <table v-else class="tableau">
        <thead>
          <tr>
            <th>Date</th>
            <th>Action</th>
            <th>Administrateur</th>
            <th>Objet</th>
            <th>Résultat</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(e, i) in evenements" :key="`${e.date}-${i}`">
            <td class="mono">{{ dateCourte(e.date) }}</td>
            <td>{{ libelle(e.action) }}</td>
            <td class="mono">{{ e.administrateur }}</td>
            <td class="mono">{{ objet(e) }}</td>
            <td>
              <span v-if="e.resultat === 'ok'" class="pastille pastille--ok">ok</span>
              <span v-else class="pastille pastille--danger" :title="e.motif">échec</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped lang="scss">
.vue { display: flex; flex-direction: column; gap: $r-4; }

.entete {
  display: flex;
  align-items: flex-start;
  gap: $r-3;

  .message { flex: 1; }
  .champ { width: 220px; flex: none; }
}

.sr {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
