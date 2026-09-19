<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const identifiant = ref('')
const motDePasse = ref('')
const erreur = ref<string | null>(null)

async function soumettre() {
  erreur.value = null
  try {
    await session.connecter(identifiant.value.trim(), motDePasse.value)
    const suite = route.query.suite
    router.push(typeof suite === 'string' ? suite : { name: 'tableau-de-bord' })
  } catch (e) {
    erreur.value = (e as Error).message
    motDePasse.value = ''
  }
}
</script>

<template>
  <div class="page">
    <form class="boite" @submit.prevent="soumettre">
      <img class="boite__logo" src="/logo.png" alt="INSTAD — Institut de la Statistique de Djibouti" />

      <div class="boite__titre">
        <h1>Console de l'enclave</h1>
        <p>Administration des accès et supervision des sessions</p>
      </div>

      <p v-if="erreur" class="message message--erreur" role="alert">{{ erreur }}</p>

      <div class="champ">
        <label for="identifiant">Identifiant</label>
        <input
          id="identifiant"
          v-model="identifiant"
          type="text"
          autocomplete="username"
          required
          autofocus
        />
      </div>

      <div class="champ">
        <label for="mdp">Mot de passe</label>
        <input
          id="mdp"
          v-model="motDePasse"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>

      <button type="submit" class="btn btn--primaire" :disabled="session.chargement">
        {{ session.chargement ? 'Vérification…' : 'Se connecter' }}
      </button>

      <p class="boite__note">
        Accès restreint aux administrateurs de l'enclave. Chaque connexion est
        consignée au journal d'audit.
      </p>
    </form>
  </div>
</template>

<style scoped lang="scss">
.page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: $r-5;
  // Le bleu de marque en fond : l'écran de connexion est le seul moment où
  // l'identité prend toute la place.
  background:
    radial-gradient(circle at 20% 15%, rgba(255, 255, 255, 0.07), transparent 45%),
    $djib-blue;
}

.boite {
  display: flex;
  flex-direction: column;
  gap: $r-4;
  width: 100%;
  max-width: 380px;
  padding: $r-6;
  background: $white;
  border-radius: $rayon;
  box-shadow: $ombre-h;
  // Filet rouge : le seul rappel du bandeau du logo.
  border-top: 3px solid $djib-red;

  &__logo {
    width: 190px;
    align-self: flex-start;
  }

  &__titre {
    display: flex;
    flex-direction: column;
    gap: 3px;

    h1 { font-size: 19px; }
    p  { font-size: 13px; color: $ink-3; }
  }

  &__note {
    font-size: 12px;
    line-height: 1.5;
    color: $ink-3;
    padding-top: $r-3;
    border-top: 1px solid $rule-soft;
  }

  .btn { margin-top: $r-1; }
}
</style>
