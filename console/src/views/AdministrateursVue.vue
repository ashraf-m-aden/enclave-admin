<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api'
import { useSessionStore } from '@/stores/session'
import { dateCourte, motDePasseSuggere } from '@/utils'
import type { Administrateur } from '@/types'

const sessionStore = useSessionStore()

const comptes = ref<Administrateur[]>([])
const erreur = ref<string | null>(null)
const enCours = ref(false)

const formulaireOuvert = ref(false)
const identifiant = ref('')
const nom = ref('')
const motDePasse = ref('')
/** Renseigné quand on change le mot de passe d'un compte existant. */
const cible = ref<Administrateur | null>(null)

/** Montré une seule fois, juste après création : le registre n'en garde qu'une empreinte. */
const secretAffiche = ref<{ identifiant: string; motDePasse: string } | null>(null)
const copie = ref(false)

const moi = computed(() => sessionStore.administrateur?.identifiant ?? '')
const seul = computed(() => comptes.value.length <= 1)

async function charger() {
  erreur.value = null
  try {
    comptes.value = (await api.administrateurs()).administrateurs
  } catch (e) {
    erreur.value = (e as Error).message
  }
}

function ouvrirNouveau() {
  cible.value = null
  identifiant.value = ''
  nom.value = ''
  motDePasse.value = motDePasseSuggere()
  erreur.value = null
  formulaireOuvert.value = true
}

function ouvrirChangement(c: Administrateur) {
  cible.value = c
  identifiant.value = c.identifiant
  nom.value = c.nom
  motDePasse.value = motDePasseSuggere()
  erreur.value = null
  formulaireOuvert.value = true
}

async function soumettre() {
  erreur.value = null
  enCours.value = true
  try {
    await api.creerAdministrateur(identifiant.value.trim(), nom.value.trim(), motDePasse.value)
    secretAffiche.value = { identifiant: identifiant.value.trim(), motDePasse: motDePasse.value }
    copie.value = false
    formulaireOuvert.value = false
    motDePasse.value = ''
    await charger()
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

async function supprimer(c: Administrateur) {
  const sur = window.confirm(
    `Supprimer le compte d'administration ${c.identifiant} ?\n\n`
    + "Cette personne n'aura plus accès à la console.",
  )
  if (!sur) return

  erreur.value = null
  try {
    await api.supprimerAdministrateur(c.identifiant)
    await charger()
  } catch (e) {
    erreur.value = (e as Error).message
  }
}

onMounted(charger)
</script>

<template>
  <div class="vue">
    <p v-if="erreur" class="message message--erreur" role="alert">{{ erreur }}</p>

    <!-- Pourquoi un second compte compte vraiment -->
    <p v-if="seul" class="message message--alerte">
      <strong>Un seul compte d'administration existe.</strong> Le double contrôle
      de la réinitialisation du second facteur ne peut pas s'appliquer : une
      demande s'exécute alors immédiatement, sans approbation. Créer un second
      compte n'est pas un confort, c'est ce qui rétablit ce contrôle.
    </p>
    <p v-else class="message message--info">
      Le double contrôle est actif : la réinitialisation du second facteur d'un
      chercheur exige qu'un <strong>autre</strong> administrateur approuve.
    </p>

    <!-- Mot de passe, montré une seule fois -->
    <section v-if="secretAffiche" class="secret">
      <div class="secret__texte">
        <h2>Compte prêt : {{ secretAffiche.identifiant }}</h2>
        <p>
          Ce mot de passe <strong>ne sera plus jamais affiché</strong>.
          Transmettez-le par un canal hors bande, puis fermez ce bandeau.
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
      <h2>{{ cible ? `Changer le mot de passe de ${cible.identifiant}` : 'Nouvel administrateur' }}</h2>

      <form class="formulaire__champs" @submit.prevent="soumettre">
        <div class="champ">
          <label for="ident">Identifiant</label>
          <input
            id="ident" v-model="identifiant" type="text" class="mono"
            placeholder="prenom.nom"
            pattern="[a-z_][a-z0-9_.\-]{0,30}"
            title="Minuscules, chiffres, point, tiret ou souligné"
            :readonly="!!cible" required
          />
        </div>

        <div class="champ">
          <label for="nom">Nom affiché</label>
          <input id="nom" v-model="nom" type="text" placeholder="Prénom Nom" />
        </div>

        <div class="champ">
          <label for="mdp">Mot de passe</label>
          <div class="champ__avec-bouton">
            <input id="mdp" v-model="motDePasse" type="text" class="mono" minlength="12" required />
            <button type="button" class="btn btn--neutre btn--petit"
                    @click="motDePasse = motDePasseSuggere()">
              Régénérer
            </button>
          </div>
        </div>

        <div class="formulaire__actions">
          <button type="submit" class="btn btn--primaire" :disabled="enCours">
            {{ enCours ? 'Enregistrement…' : cible ? 'Changer le mot de passe' : 'Créer le compte' }}
          </button>
          <button type="button" class="btn btn--neutre" @click="formulaireOuvert = false">
            Annuler
          </button>
        </div>
      </form>
    </section>

    <!-- Liste -->
    <section class="bloc">
      <div class="bloc__entete">
        <h2>Comptes d'administration</h2>
        <button v-if="!formulaireOuvert" type="button"
                class="btn btn--primaire btn--petit" @click="ouvrirNouveau">
          Nouvel administrateur
        </button>
      </div>

      <div class="tableau-cadre">
        <p v-if="comptes.length === 0" class="vide">Aucun compte.</p>

        <table v-else class="tableau">
          <thead>
            <tr><th>Identifiant</th><th>Nom</th><th>Créé le</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="c in comptes" :key="c.identifiant">
              <td class="mono">
                {{ c.identifiant }}
                <span v-if="c.identifiant === moi" class="pastille pastille--ok">vous</span>
              </td>
              <td>{{ c.nom }}</td>
              <td class="mono">{{ dateCourte(c.cree_le) }}</td>
              <td class="actions">
                <button type="button" class="btn btn--neutre btn--petit"
                        @click="ouvrirChangement(c)">
                  Changer le mot de passe
                </button>
                <button
                  type="button" class="btn btn--danger btn--petit"
                  :disabled="c.identifiant === moi || seul"
                  :title="c.identifiant === moi
                    ? 'Vous ne pouvez pas supprimer votre propre compte'
                    : seul ? 'Le dernier compte ne peut pas être supprimé' : ''"
                  @click="supprimer(c)"
                >
                  Supprimer
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
.vue { display: flex; flex-direction: column; gap: $r-4; }

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

.secret {
  @include carte;
  display: flex;
  flex-direction: column;
  gap: $r-3;
  padding: $r-4;
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
    }
  }

  > .btn { align-self: flex-start; }
}

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

  input { flex: 1; }
  .btn { white-space: nowrap; }
}

.actions {
  display: flex;
  gap: $r-2;
  justify-content: flex-end;
  white-space: nowrap;
}

.pastille { margin-left: $r-2; }
</style>
