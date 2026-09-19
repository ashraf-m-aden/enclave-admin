<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api'
import { useEnclaveStore } from '@/stores/enclave'
import { useSessionStore } from '@/stores/session'
import { dateCourte } from '@/utils'
import type { DemandeReenrolement } from '@/types'

const enclave = useEnclaveStore()
const sessionStore = useSessionStore()

const demandes = ref<DemandeReenrolement[]>([])
const doubleControle = ref(true)
const erreur = ref<string | null>(null)
const enCours = ref(false)

const formulaireOuvert = ref(false)
const cible = ref('')
const motif = ref('')

const moi = computed(() => sessionStore.administrateur?.identifiant ?? '')

const enAttente = computed(() => demandes.value.filter((d) => d.etat === 'en-attente'))
const emis = computed(() => demandes.value.filter((d) => d.etat === 'ticket-emis'))

/** Un ticket non transmis au chercheur est une réinitialisation inachevée. */
const aNotifier = computed(() => emis.value.filter((d) => !d.notifie))

async function charger() {
  erreur.value = null
  try {
    const r = await api.reenrolements()
    demandes.value = r.demandes
    doubleControle.value = r.double_controle
  } catch (e) {
    erreur.value = (e as Error).message
  }
}

async function demander() {
  if (!cible.value) return
  erreur.value = null
  enCours.value = true
  try {
    await api.demanderReenrolement(cible.value, motif.value)
    formulaireOuvert.value = false
    cible.value = ''
    motif.value = ''
    await charger()
  } catch (e) {
    erreur.value = (e as Error).message
  } finally {
    enCours.value = false
  }
}

async function approuver(d: DemandeReenrolement) {
  const sur = window.confirm(
    `Approuver la réinitialisation du second facteur de ${d.identifiant} ?\n\n`
    + 'Son second facteur actuel sera détruit. Un ticket à usage unique sera '
    + 'émis, valable une heure, à lui transmettre hors bande.',
  )
  if (!sur) return

  erreur.value = null
  try {
    await api.approuverReenrolement(d.identifiant)
    await charger()
  } catch (e) {
    erreur.value = (e as Error).message
  }
}

async function annuler(d: DemandeReenrolement) {
  erreur.value = null
  try {
    await api.annulerReenrolement(d.identifiant)
    await charger()
  } catch (e) {
    erreur.value = (e as Error).message
  }
}

async function notifier(d: DemandeReenrolement) {
  const canal = window.prompt(
    `Par quel canal avez-vous prévenu ${d.identifiant} ?\n\n`
    + 'Téléphone, en personne, messagerie institutionnelle…\n'
    + "Cette confirmation est consignée au journal d'audit.",
    'téléphone',
  )
  if (canal === null) return

  erreur.value = null
  try {
    await api.marquerNotifie(d.identifiant, canal)
    await charger()
  } catch (e) {
    erreur.value = (e as Error).message
  }
}

onMounted(async () => {
  await Promise.all([charger(), enclave.chargerAcces()])
})
</script>

<template>
  <div class="vue">
    <p v-if="erreur" class="message message--erreur" role="alert">{{ erreur }}</p>

    <!-- Ce que cette page permet, dit sans détour -->
    <section class="avertissement">
      <h2>Ce que cette opération autorise</h2>
      <p>
        Le second facteur est la dernière barrière qui empêche un administrateur
        de se faire passer pour un chercheur : changer un mot de passe ne suffit
        pas, le code reste exigé. <strong>Le réinitialiser ouvre donc l'accès aux
        données du chercheur sous son identité.</strong>
      </p>
      <p>
        Trois contrôles l'encadrent : un second administrateur doit approuver, le
        ticket émis expire au bout d'une heure, et le chercheur doit être prévenu
        hors bande — c'est ce qui lui permet de détecter une réinitialisation
        qu'il n'a pas demandée.
      </p>
      <p v-if="!doubleControle" class="message message--alerte">
        <strong>Un seul compte d'administration existe</strong> : le double
        contrôle ne peut pas s'appliquer, et les demandes s'exécutent
        immédiatement. Créez un second compte administrateur pour le rétablir.
      </p>
    </section>

    <!-- Tickets à transmettre : ce qui exige une action maintenant -->
    <section v-if="aNotifier.length > 0" class="bloc">
      <h2>Tickets à transmettre</h2>
      <article v-for="d in aNotifier" :key="d.identifiant" class="ticket">
        <div class="ticket__entete">
          <h3>{{ d.identifiant }}</h3>
          <span class="pastille pastille--alerte">chercheur non prévenu</span>
        </div>

        <div class="ticket__valeur">
          <code>{{ d.ticket }}</code>
          <span class="ticket__expire">expire le {{ dateCourte(d.expire_le) }}</span>
        </div>

        <p class="ticket__aide">
          Transmettez ce ticket au chercheur <strong>hors bande</strong> — de vive
          voix, par téléphone. Il en aura besoin en plus de son mot de passe pour
          associer une nouvelle application d'authentification.
        </p>

        <button type="button" class="btn btn--primaire btn--petit" @click="notifier(d)">
          J'ai prévenu le chercheur
        </button>
      </article>
    </section>

    <!-- Demandes en attente d'un second administrateur -->
    <section class="bloc">
      <div class="bloc__entete">
        <h2>Demandes en attente</h2>
        <button v-if="!formulaireOuvert" type="button" class="btn btn--neutre btn--petit"
                @click="formulaireOuvert = true">
          Nouvelle demande
        </button>
      </div>

      <form v-if="formulaireOuvert" class="formulaire" @submit.prevent="demander">
        <div class="champ">
          <label for="cible">Chercheur</label>
          <select id="cible" v-model="cible" required>
            <option value="">Choisir…</option>
            <option v-for="a in enclave.acces" :key="a.identifiant" :value="a.identifiant">
              {{ a.identifiant }}
            </option>
          </select>
        </div>

        <div class="champ">
          <label for="motif">Motif</label>
          <input id="motif" v-model="motif" type="text" required
                 placeholder="téléphone perdu, appareil remplacé…" />
        </div>

        <div class="formulaire__actions">
          <button type="submit" class="btn btn--primaire" :disabled="enCours">
            {{ enCours ? 'Envoi…' : 'Demander la réinitialisation' }}
          </button>
          <button type="button" class="btn btn--neutre" @click="formulaireOuvert = false">
            Annuler
          </button>
        </div>
      </form>

      <div class="tableau-cadre">
        <p v-if="enAttente.length === 0" class="vide">Aucune demande en attente.</p>
        <table v-else class="tableau">
          <thead>
            <tr><th>Chercheur</th><th>Motif</th><th>Demandé par</th><th>Le</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="d in enAttente" :key="d.identifiant">
              <td class="mono">{{ d.identifiant }}</td>
              <td>{{ d.motif || '—' }}</td>
              <td class="mono">{{ d.demande_par }}</td>
              <td class="mono">{{ dateCourte(d.demande_le) }}</td>
              <td class="actions">
                <!-- Le demandeur ne peut pas approuver : c'est le double contrôle. -->
                <button v-if="d.demande_par !== moi" type="button"
                        class="btn btn--primaire btn--petit" @click="approuver(d)">
                  Approuver
                </button>
                <span v-else class="indispo" title="Un autre administrateur doit approuver.">
                  en attente d'un second administrateur
                </span>
                <button type="button" class="btn btn--neutre btn--petit" @click="annuler(d)">
                  Annuler
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Historique -->
    <section class="bloc">
      <h2>Réinitialisations récentes</h2>
      <div class="tableau-cadre">
        <p v-if="emis.length === 0" class="vide">Aucune réinitialisation.</p>
        <table v-else class="tableau">
          <thead>
            <tr>
              <th>Chercheur</th><th>Demandé par</th><th>Approuvé par</th>
              <th>Chercheur prévenu</th><th>Ticket</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="d in emis" :key="d.identifiant">
              <td class="mono">{{ d.identifiant }}</td>
              <td class="mono">{{ d.demande_par }}</td>
              <td class="mono">{{ d.approuve_par || '— (contrôle unique)' }}</td>
              <td>
                <span v-if="d.notifie" class="pastille pastille--ok">
                  {{ d.canal || 'oui' }}
                </span>
                <span v-else class="pastille pastille--alerte">non</span>
              </td>
              <td>
                <span v-if="d.etat_ticket?.utilise" class="pastille pastille--ok">utilisé</span>
                <span v-else-if="d.etat_ticket?.expire" class="pastille pastille--neutre">expiré</span>
                <span v-else class="pastille pastille--alerte">en attente</span>
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

.avertissement {
  @include carte;
  display: flex;
  flex-direction: column;
  gap: $r-2;
  padding: $r-4;
  // Rouge de marque : cette page porte l'opération la plus sensible.
  border-left: 3px solid $djib-red;

  h2 { font-size: 15px; }
  p  { font-size: 13px; color: $ink-2; max-width: 76ch; }
}

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

.ticket {
  @include carte;
  display: flex;
  flex-direction: column;
  gap: $r-3;
  padding: $r-4;
  border-left: 3px solid $alerte;

  &__entete {
    display: flex;
    align-items: center;
    gap: $r-3;

    h3 { @include mono(15px); }
  }

  &__valeur {
    display: flex;
    align-items: center;
    gap: $r-3;
    flex-wrap: wrap;

    code {
      @include mono(19px);
      padding: 9px $r-4;
      background: $blue-050;
      border: 1px solid $rule;
      border-radius: $rayon-s;
      user-select: all;
      letter-spacing: 0.1em;
    }
  }

  &__expire { font-size: 12px; color: $ink-3; }

  &__aide { font-size: 13px; color: $ink-2; max-width: 74ch; }

  > .btn { align-self: flex-start; }
}

.formulaire {
  @include carte;
  display: flex;
  flex-direction: column;
  gap: $r-4;
  padding: $r-4;
  max-width: 460px;

  &__actions { display: flex; gap: $r-2; }
}

.actions {
  display: flex;
  align-items: center;
  gap: $r-2;
  justify-content: flex-end;
  white-space: nowrap;
}

.indispo { font-size: 12px; color: $ink-3; font-style: italic; }
</style>
