import { createRouter, createWebHistory } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const routes = [
  { path: '/', redirect: '/tableau-de-bord' },
  { path: '/connexion', name: 'connexion', component: () => import('@/views/ConnexionVue.vue'), meta: { public: true } },
  { path: '/tableau-de-bord', name: 'tableau-de-bord', component: () => import('@/views/TableauBordVue.vue'), meta: { titre: 'Tableau de bord' } },
  { path: '/acces', name: 'acces', component: () => import('@/views/AccesVue.vue'), meta: { titre: 'Accès chercheurs' } },
  { path: '/sessions', name: 'sessions', component: () => import('@/views/SessionsVue.vue'), meta: { titre: 'Sessions en cours' } },
  { path: '/second-facteur', name: 'second-facteur', component: () => import('@/views/SecondFacteurVue.vue'), meta: { titre: 'Second facteur' } },
  { path: '/reconciliation', name: 'reconciliation', component: () => import('@/views/ReconciliationVue.vue'), meta: { titre: 'Réconciliation' } },
  { path: '/sorties', name: 'sorties', component: () => import('@/views/SortiesVue.vue'), meta: { titre: 'Circuit de sortie' } },
  { path: '/administrateurs', name: 'administrateurs', component: () => import('@/views/AdministrateursVue.vue'), meta: { titre: 'Administrateurs' } },
  { path: '/journal', name: 'journal', component: () => import('@/views/JournalVue.vue'), meta: { titre: "Journal d'audit" } },
  { path: '/:chemin(.*)*', redirect: '/tableau-de-bord' },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (vers) => {
  const session = useSessionStore()
  // Au premier chargement, on ne sait pas encore si le cookie est valide.
  if (!session.verifie) await session.verifier()

  if (!vers.meta.public && !session.administrateur) {
    return { name: 'connexion', query: { suite: vers.fullPath } }
  }
  if (vers.meta.public && session.administrateur) {
    return { name: 'tableau-de-bord' }
  }
  return true
})
