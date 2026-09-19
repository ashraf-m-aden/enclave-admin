<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import { useEnclaveStore } from '@/stores/enclave'
import { dateCourte, motDePasseSuggere } from '@/utils'
import type { Acces } from '@/types'

const enclave = useEnclaveStore()

const formulaireOuvert = ref(false)
const identifiant = ref('')
const motDePasse = ref('')
const cible = ref<Acces | null>(null)     // null = nouvel accès
const enCours = ref(false)
const erreur = ref<string | null>(null)

/**
 * Le mot de passe n'est montré QU'UNE FOIS, ici, juste après avoir été posé.
 * Il n'existe en clair qu'à cet instant : le registre ne garde qu'une
 * empreinte, et Samba un hash NT. Personne ne pourra le relire ensuite.
 */
const secretAffiche = ref<{ identifiant: string; motDePasse: string } | null>(null)
const copie = ref(false)

function ouvrirNouveau() {
  cible.value = null
  identifiant.value = ''
  motDePasse.value = motDePasseSuggere()
  erreur.value = null
  formulaireOuvert.value = true
}

function ouvrirChangement(acces: Acces) {
  cible.value = acces
  identifiant.value = acces.identifiant
  motDePasse.value = motDePasseSuggere()
  erreur.value = null
  formulaireOuvert.value = true
}

function fermer() {
  formulaireOuvert.value = false
  motDePasse.value = ''
}

async function soumettre() {
  erreur.value = null
  enCours.value = true
  try {
    await api.provisionner(identifiant.value.trim(), motDePasse.value)
    secretAffiche.value = { identifiant: identifiant.value.trim(), motDePasse: motDePasse.value }
    copie.value = false
    fermer()
    await enclave.chargerAcces()
  } catch (e) {
    erreur.value = (e as Error).message
  } finally {
    enCours.value = false
  }
}

async function copier() {
  if (!secretAffiche.value) return
  try {
    await navigator.clipboard.writeText(secretAffiche.value.motDePasse)
    copie.value = true
  } catch {
    erreur.value = 'copie impossible — sélectionnez le mot de passe à la main'
  }
}

async function revoquer(acces: Acces) {
  const sur = window.confirm(
    `Révoquer l'accès de ${acces.identifiant} ?\n\n`
    + "Le compte Samba sera retiré. L'opération est refusée si le dossier "
    + 'de travail du chercheur contient des fichiers.',
  )
  if (!sur) return

  erreur.value = null
  try {
    await api.revoquer(acces.identifiant)
    await enclave.chargerAcces()
  } catch (e) {
    erreur.value = (e as Error).message
  }
}

onMounted(() => enclave.chargerAcces())
</script>

<template>
  <div class="vue">
    <p v-if="erreur" class="message message--erreur" role="alert">{{ erreur }}</p>

    <!-- Le mot de passe, montré une seule fois -->
    <section v-if="secretAffiche" class="secret">
      <div class="secret__texte">
        <h2>Accès prêt pour {{ secretAffiche.identifiant }}</h2>
        <p>
          Ce mot de passe <strong>ne sera plus jamais affiché</strong>. Transmettez-le
          au chercheur par un canal hors bande, puis fermez ce bandeau.
        </p>
      </div>

      <div class="secret__valeur">
        <code>{{ secretAffiche.motDePasse }}</code>
        <button type="button" class="btn btn--neutre btn--petit" @click="copier">
          {{ copie ? 'Copié' : 'Copier' }}
        </button>
      </div>

      <button type="button" class="btn btn--primaire btn--petit" @click="secretAffiche = null">
        J'ai transmis le mot de passe
      </button>
    </section>

    <!-- Formulaire -->
    <section v-if="formulaireOuvert" class="formulaire">
      <h2>{{ cible ? `Changer le mot de passe de ${cible.identifiant}` : 'Nouvel accès' }}</h2>

      <p v-if="cible" class="message message--info">
        Changer un mot de passe, c'est rejouer le provisionnement : le compte Samba
        et l'empreinte enregistrée sont remis à jour ensemble. Une session déjà
        ouverte n'est pas interrompue ; le nouveau mot de passe vaut pour la
        session suivante.
      </p>

      <form class="formulaire__champs" @submit.prevent="soumettre">
        <div class="champ">
          <label for="ident">Identifiant du chercheur</label>
          <input
            id="ident"
            v-model="identifiant"
            type="text"
            class="mono"
            placeholder="prenom.nom"
            pattern="[a-z_][a-z0-9_.\-]{0,30}"
            title="Minuscules, chiffres, point, tiret ou souligné"
            :readonly="!!cible"
            required
          />
        </div>

        <div class="champ">
          <label for="mdp">Mot de passe</label>
          <div class="champ__avec-bouton">
            <input id="mdp" v-model="motDePasse" type="text" class="mono" minlength="12" required />
            <button type="button" class="btn btn--neutre btn--petit" @click="motDePasse = motDePasseSuggere()">
              Régénérer
            </button>
          </div>
        </div>

        <div class="formulaire__actions">
          <button type="submit" class="btn btn--primaire" :disabled="enCours">
            {{ enCours ? 'Provisionnement…' : cible ? 'Changer le mot de passe' : "Créer l'accès" }}
          </button>
          <button type="button" class="btn btn--neutre" @click="fermer">Annuler</button>
        </div>
      </form>
    </section>

    <!-- Liste -->
    <section class="bloc">
      <div class="bloc__entete">
        <h2>Accès enregistrés</h2>
        <button v-if="!formulaireOuvert" type="button" class="btn btn--primaire btn--petit" @click="ouvrirNouveau">
          Nouvel accès
        </button>
      </div>

      <div class="tableau-cadre">
        <p v-if="enclave.acces.length === 0" class="vide">Aucun accès enregistré.</p>

        <table v-else class="tableau">
          <thead>
            <tr>
              <th>Identifiant</th>
              <th>État</th>
              <th>Authentification</th>
              <th>Mot de passe posé le</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in enclave.acces" :key="a.identifiant">
              <td class="mono">{{ a.identifiant }}</td>
              <td>
                <span v-if="a.etat === 'actif'" class="pastille pastille--ok">actif</span>
                <span v-else class="pastille pastille--alerte" :title="'Provisionnement interrompu : aucune session ne peut être ouverte.'">
                  incomplet
                </span>
              </td>
              <td>
                <span v-if="a.auth_verifiee" class="pastille pastille--ok">vérifiée</span>
                <span v-else class="pastille pastille--neutre">non vérifiée</span>
              </td>
              <td class="mono">{{ dateCourte(a.mdp_pose_le) }}</td>
              <td class="actions">
                <button type="button" class="btn btn--neutre btn--petit" @click="ouvrirChangement(a)">
                  Changer le mot de passe
                </button>
                <button type="button" class="btn btn--danger btn--petit" @click="revoquer(a)">
                  Révoquer
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.vue { display: flex; flex-direction: column; gap: $r-5; }

.bloc {
  display: flex;
  flex-direction: column;
  gap: $r-3;

  &__entete {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $r-3;
  }
}

// ---------- bandeau du mot de passe ----------

.secret {
  @include carte;
  display: flex;
  flex-direction: column;
  gap: $r-3;
  padding: $r-4;
  // Rouge de marque : ce bandeau porte une information qui disparaît.
  border-left: 3px solid $djib-red;

  &__texte {
    display: flex;
    flex-direction: column;
    gap: 4px;

    h2 { font-size: 15px; }
    p  { font-size: 13px; color: $ink-2; max-width: 68ch; }
  }

  &__valeur {
    display: flex;
    align-items: center;
    gap: $r-2;
    flex-wrap: wrap;

    code {
      @include mono(15px);
      padding: 9px $r-3;
      background: $blue-050;
      border: 1px solid $rule;
      border-radius: $rayon-s;
      user-select: all;
      letter-spacing: 0.02em;
    }
  }

  > .btn { align-self: flex-start; }
}

// ---------- formulaire ----------

.formulaire {
  @include carte;
  display: flex;
  flex-direction: column;
  gap: $r-3;
  padding: $r-4;

  &__champs {
    display: flex;
    flex-direction: column;
    gap: $r-4;
    max-width: 460px;
  }

  &__actions { display: flex; gap: $r-2; }
}

.champ__avec-bouton {
  display: flex;
  gap: $r-2;
  align-items: stretch;

  input { flex: 1; }
  .btn { white-space: nowrap; }
}

.actions {
  display: flex;
  gap: $r-2;
  justify-content: flex-end;
  white-space: nowrap;
}
</style>
