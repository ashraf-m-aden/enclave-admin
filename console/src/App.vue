<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const connecte = computed(() => !!session.administrateur)
const titre = computed(() => (route.meta.titre as string) || '')

const liens = [
  { nom: 'tableau-de-bord', libelle: "Vue d'ensemble" },
  { nom: 'acces', libelle: 'Accès chercheurs' },
  { nom: 'sessions', libelle: 'Sessions en cours' },
  { nom: 'sorties', libelle: 'Circuit de sortie' },
  { nom: 'second-facteur', libelle: 'Second facteur' },
  { nom: 'reconciliation', libelle: 'Réconciliation' },
  { nom: 'journal', libelle: "Journal d'audit" },
]

async function deconnecter() {
  await session.deconnecter()
  router.push({ name: 'connexion' })
}
</script>

<template>
  <div v-if="!connecte" class="nu">
    <RouterView />
  </div>

  <div v-else class="cadre">
    <aside class="barre">
      <div class="barre__marque">
        <img src="/logo.png" alt="INSTAD — Institut de la Statistique de Djibouti" />
        <p class="barre__sous-titre">Enclave sécurisée</p>
      </div>

      <nav class="barre__nav">
        <RouterLink
          v-for="lien in liens"
          :key="lien.nom"
          :to="{ name: lien.nom }"
          class="barre__lien"
          active-class="barre__lien--actif"
        >
          {{ lien.libelle }}
        </RouterLink>
      </nav>

      <div class="barre__pied">
        <p class="barre__admin">{{ session.administrateur?.nom }}</p>
        <button type="button" class="btn btn--neutre btn--petit" @click="deconnecter">
          Se déconnecter
        </button>
      </div>
    </aside>

    <main class="contenu">
      <header class="contenu__entete">
        <h1>{{ titre }}</h1>
      </header>
      <div class="contenu__corps">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<style scoped lang="scss">
.nu { min-height: 100%; }

.cadre {
  display: grid;
  grid-template-columns: $largeur-barre 1fr;
  min-height: 100%;

  @media #{$tablette} { grid-template-columns: 1fr; }
}

// ---------- barre latérale ----------

.barre {
  display: flex;
  flex-direction: column;
  gap: $r-5;
  padding: $r-5 $r-4;
  background: $djib-blue;
  border-right: 1px solid $blue-900;

  @media #{$tablette} {
    flex-direction: row;
    align-items: center;
    gap: $r-4;
    padding: $r-3 $r-4;
    overflow-x: auto;
  }

  &__marque {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 $r-2;

    img {
      // Le logo porte son propre fond blanc : une pastille le détache
      // proprement du bleu de marque.
      width: 100%;
      max-width: 190px;
      background: $white;
      padding: 7px 9px;
      border-radius: $rayon-s;
    }

    @media #{$tablette} { img { max-width: 140px; } }
  }

  &__sous-titre {
    @include etiquette;
    color: rgba(255, 255, 255, 0.72);
    letter-spacing: 0.1em;

    @media #{$tablette} { display: none; }
  }

  &__nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;

    @media #{$tablette} { flex-direction: row; gap: $r-1; }
  }

  &__lien {
    padding: 9px $r-3;
    border-radius: $rayon-s;
    font-size: 13.5px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.82);
    white-space: nowrap;
    transition: $transition;
    @include focus-visible;

    &:hover {
      background: rgba(255, 255, 255, 0.08);
      color: $white;
      text-decoration: none;
    }

    &--actif {
      background: $white;
      color: $djib-blue;
      font-weight: 600;
      // Rappel du rouge du logo, sur l'élément actif seulement.
      box-shadow: inset 3px 0 0 $djib-red;

      &:hover { background: $white; color: $djib-blue; }
    }
  }

  &__pied {
    display: flex;
    flex-direction: column;
    gap: $r-2;
    padding-top: $r-4;
    border-top: 1px solid rgba(255, 255, 255, 0.14);

    @media #{$tablette} {
      flex-direction: row;
      align-items: center;
      padding-top: 0;
      border-top: none;
      border-left: 1px solid rgba(255, 255, 255, 0.14);
      padding-left: $r-4;
    }
  }

  &__admin {
    font-size: 12.5px;
    color: rgba(255, 255, 255, 0.82);
    @include tronquer;
  }
}

// ---------- contenu ----------

.contenu {
  display: flex;
  flex-direction: column;
  min-width: 0;

  &__entete {
    padding: $r-5 $r-6 $r-4;
    background: $white;
    border-bottom: 1px solid $rule;

    @media #{$mobile} { padding: $r-4; }
  }

  &__corps {
    flex: 1;
    padding: $r-5 $r-6 $r-7;
    min-width: 0;

    @media #{$mobile} { padding: $r-4; }
  }
}
</style>
