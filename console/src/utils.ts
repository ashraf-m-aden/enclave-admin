/** Formatages partagés par les vues. */

export function dateCourte(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** Durée lisible à partir de secondes d'uptime. */
export function duree(secondes: number): string {
  if (!secondes) return '—'
  const h = Math.floor(secondes / 3600)
  const m = Math.floor((secondes % 3600) / 60)
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')}`
  if (m > 0) return `${m} min`
  return `${secondes} s`
}

/**
 * Mot de passe de session : lisible à dicter, et assez long pour rester
 * solide. Tiré de `crypto.getRandomValues`, jamais de `Math.random`.
 */
export function motDePasseSuggere(longueur = 20): string {
  // Sans caractères ambigus (I, l, 1, O, 0) : ce mot de passe est transmis
  // de vive voix ou par un canal hors bande.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const symboles = '!@#$%&*-+='
  const source = alphabet + symboles
  const octets = new Uint32Array(longueur)
  crypto.getRandomValues(octets)
  let sortie = ''
  for (let i = 0; i < longueur; i++) sortie += source[octets[i] % source.length]
  // Garantit au moins un symbole, sans biaiser le reste.
  if (![...symboles].some((s) => sortie.includes(s))) {
    const pos = octets[0] % longueur
    sortie = sortie.slice(0, pos) + symboles[octets[1] % symboles.length] + sortie.slice(pos + 1)
  }
  return sortie
}
