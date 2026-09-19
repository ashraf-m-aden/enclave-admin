<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import { useEnclaveStore } from '@/stores/enclave'
import { dateCourte } from '@/utils'

const enclave = useEnclaveStore()
const enCours = ref(false)
const erreur = ref<string | null>(null)
const suppression = ref<string | null>(null)

/**
 * Supprime un orphelin. Action HUMAINE : la réconciliation signale, elle ne
 * corrige jamais d'elle-même.
 *
 * L'agent refuse de retirer un compte dont le dossier de travail n'est pas
 * vide. Le dépôt « sorties » est conservé : il peut contenir des résultats
 * qui attendent une validation.
 */
async function supprimerOrphelin(username: string) {
  const sur = window.confirm(
    [
      `Supprimer le compte Samba orphelin ${username} ?`,
      '',
      "Le compte est retiré du serveur de fichiers. L'opération est refusée "
      + 'si son dossier de travail contient des fichiers.',
      '',
      'Son dépôt « sorties » est conservé : il peut contenir des résultats '
      + 'en attente de validation.',
    ].join('\n'),
  )
  if (!sur) return

  erreur.value = null
  suppression.value = username
  try {
    await api.supprimerOrphelin(username)
    await enclave.chargerReconciliation()
  } catch (e) {
    erreur.value = (e as Error).message
  } finally {
    suppression.value = null
  }
}

async function relancer() {
  enCours.value = true
  try {
    await enclave.chargerReconciliation()
  } finally {
    enCours.value = false
  }
}

onMounted(relancer)
</script>

<template>
  <div class="vue">
    <p v-if="erreur || enclave.erreur" class="message message--erreur" role="alert">
      {{ erreur || enclave.erreur }}
    </p>

    <section class="intro">
      <p class="message message--info">
        La réconciliation compare la base Samba au registre local. Elle
        <strong>signale sans rien corriger</strong> : une suppression automatique
        sur fausse détection effacerait un accès légitime. Chaque ligne
        ci-dessous demande une décision humaine.
      </p>
      <button type="button" class="btn btn--neutre btn--petit" :disabled="enCours" @click="relancer">
        {{ enCours ? 'Analyse…' : 'Relancer' }}
      </button>
    </section>

    <template v-if="enclave.reconciliation">
      <!-- Désynchronisés : le plus grave, en premier -->
      <section class="bloc">
        <h2>Modifiés hors procédure</h2>
        <p class="bloc__aide">
          Le mot de passe Samba a changé sans passer par la console. Root peut
          toujours écrire dans la base ; on ne peut pas l'en empêcher, mais on le
          voit. Rejouer le provisionnement resynchronise les deux faces.
        </p>

        <div class="tableau-cadre">
          <p v-if="enclave.reconciliation.desynchronises.length === 0" class="vide">
            Aucun écart.
          </p>
          <table v-else class="tableau">
            <thead>
              <tr><th>Identifiant</th><th>Enregistré</th><th>Constaté côté Samba</th></tr>
            </thead>
            <tbody>
              <tr v-for="d in enclave.reconciliation.desynchronises" :key="d.username">
                <td class="mono">{{ d.username }}</td>
                <td class="mono">{{ dateCourte(d.attendu) }}</td>
                <td class="mono ecart">{{ dateCourte(d.constate) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Orphelins -->
      <section class="bloc">
        <h2>Orphelins</h2>
        <p class="bloc__aide">
          Présents dans la base Samba, inconnus du registre — souvent des comptes
          créés à la main avant la console. Un orphelin ne donne rien à lui seul :
          le VLAN des sessions ne joint que le serveur de fichiers, et un clone
          n'existe que si l'orchestrateur le crée.
        </p>

        <div class="tableau-cadre">
          <p v-if="enclave.reconciliation.orphelins.length === 0" class="vide">
            Aucun orphelin.
          </p>
          <table v-else class="tableau">
            <thead>
              <tr><th>Identifiant</th><th>Mot de passe posé le</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="o in enclave.reconciliation.orphelins" :key="o.username">
                <td class="mono">{{ o.username }}</td>
                <td class="mono">{{ dateCourte(o.mdp_pose_le) }}</td>
                <td class="actions">
                  <button
                    type="button" class="btn btn--danger btn--petit"
                    :disabled="suppression === o.username"
                    @click="supprimerOrphelin(o.username)"
                  >
                    {{ suppression === o.username ? 'Suppression…' : 'Supprimer' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Incomplets -->
      <section class="bloc">
        <h2>Incomplets</h2>
        <p class="bloc__aide">
          Provisionnement interrompu avant sa validation, ou compte absent côté
          Samba. Aucune session ne peut être ouverte pour ces accès. Rejouer le
          provisionnement les complète.
        </p>

        <div class="tableau-cadre">
          <p v-if="enclave.reconciliation.incomplets.length === 0" class="vide">
            Aucun accès incomplet.
          </p>
          <table v-else class="tableau">
            <thead>
              <tr><th>Identifiant</th><th>État</th><th>Détail</th></tr>
            </thead>
            <tbody>
              <tr v-for="i in enclave.reconciliation.incomplets" :key="i.username">
                <td class="mono">{{ i.username }}</td>
                <td><span class="pastille pastille--alerte">{{ i.etat || 'inconnu' }}</span></td>
                <td>{{ i.detail || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Cohérents -->
      <section class="bloc">
        <h2>Cohérents</h2>
        <div class="tableau-cadre">
          <p v-if="enclave.reconciliation.coherents.length === 0" class="vide">
            Aucun accès cohérent.
          </p>
          <ul v-else class="liste">
            <li v-for="c in enclave.reconciliation.coherents" :key="c">
              <span class="pastille pastille--ok">{{ c }}</span>
            </li>
          </ul>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.vue { display: flex; flex-direction: column; gap: $r-5; }

.intro {
  display: flex;
  align-items: flex-start;
  gap: $r-3;

  .message { flex: 1; }
  .btn { white-space: nowrap; }
}

.bloc {
  display: flex;
  flex-direction: column;
  gap: $r-2;

  &__aide {
    font-size: 12.5px;
    color: $ink-3;
    max-width: 78ch;
    margin-bottom: $r-1;
  }
}

.ecart { color: $alerte; font-weight: 500; }

.actions { text-align: right; white-space: nowrap; }

.liste {
  display: flex;
  flex-wrap: wrap;
  gap: $r-2;
  margin: 0;
  padding: $r-4;
  list-style: none;
}
</style>
