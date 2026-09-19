<script setup lang="ts">
/**
 * Circuit d'ENTRÉE — les données sources, chercheur par chercheur.
 *
 * Un chercheur n'est habilité que sur les données de son projet. Le partage
 * Samba a pour racine `/srv/partage/donnees/%U` : la racine EST son dossier,
 * il ne peut donc même pas nommer celui d'un autre. Cet écran est le seul
 * endroit d'où ces dossiers se remplissent.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '@/api'
import { useEnclaveStore } from '@/stores/enclave'
import type { Fichier } from '@/types'

const enclave = useEnclaveStore()

const chercheur = ref('')
const fichiers = ref<Fichier[]>([])
const existe = ref(true)
const chargement = ref(false)
const erreur = ref<string | null>(null)

const depotEnCours = ref(false)
const progression = ref(0)
const suppression = ref<string | null>(null)
const champFichier = ref<HTMLInputElement | null>(null)

/** Au-delà, le dépôt passe par le serveur de fichiers (recette, chapitre 02). */
const TAILLE_MAX = 100 * 1024 * 1024

const chercheurs = computed(() =>
  [...enclave.acces.map((a) => a.identifiant)].sort())

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
    const r = await api.fichiers(chercheur.value, 'donnees')
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
 * Lit le fichier en base64 sans le charger deux fois en mémoire.
 *
 * `readAsDataURL` renvoie « data:<type>;base64,<charge> » : on ne garde que
 * ce qui suit la virgule. C'est ce que l'agent attend.
 */
function enBase64(f: File): Promise<string> {
  return new Promise((resoudre, rejeter) => {
    const lecteur = new FileReader()
    lecteur.onerror = () => rejeter(new Error('lecture du fichier impossible'))
    lecteur.onprogress = (e) => {
      if (e.lengthComputable) progression.value = Math.round((e.loaded / e.total) * 100)
    }
    lecteur.onload = () => {
      const brut = String(lecteur.result)
      const virgule = brut.indexOf(',')
      resoudre(virgule >= 0 ? brut.slice(virgule + 1) : brut)
    }
    lecteur.readAsDataURL(f)
  })
}

async function deposer(evenement: Event) {
  const entree = evenement.target as HTMLInputElement
  const choisis = Array.from(entree.files ?? [])
  if (!choisis.length || !chercheur.value) return

  erreur.value = null
  depotEnCours.value = true
  try {
    for (const f of choisis) {
      if (f.size > TAILLE_MAX) {
        throw new Error(
          `${f.name} fait ${taille(f.size)} — au-delà de ${taille(TAILLE_MAX)}, `
          + 'le dépôt passe par le serveur de fichiers.')
      }
      progression.value = 0
      await api.deposerDonnees(chercheur.value, f.name, await enBase64(f))
    }
    await charger()
  } catch (e) {
    erreur.value = (e as Error).message
  } finally {
    depotEnCours.value = false
    progression.value = 0
    // Sans cela, redéposer le même fichier ne déclencherait aucun événement.
    if (champFichier.value) champFichier.value.value = ''
  }
}

async function retirer(nom: string) {
  const sur = window.confirm(
    `Retirer « ${nom} » des données de ${chercheur.value} ?\n\n`
    + "Le chercheur ne le verra plus dès sa prochaine session. Une session en "
    + 'cours garde le fichier ouvert tant qu\'elle dure.')
  if (!sur) return

  erreur.value = null
  suppression.value = nom
  try {
    await api.retirerDonnees(chercheur.value, nom)
    await charger()
  } catch (e) {
    erreur.value = (e as Error).message
  } finally {
    suppression.value = null
  }
}

watch(chercheur, charger)
onMounted(async () => {
  if (!enclave.acces.length) await enclave.chargerAcces()
})
</script>

<template>
  <div class="vue">
    <p v-if="erreur" class="message message--erreur" role="alert">{{ erreur }}</p>

    <p class="message message--info">
      Chaque chercheur ne voit que les fichiers déposés ici <strong>pour
      lui</strong>. Il les lit, il ne peut ni les modifier ni les supprimer.
      Chaque dépôt et chaque retrait sont consignés au journal d'audit.
    </p>

    <section class="barre">
      <div class="champ">
        <label for="chercheur">Chercheur</label>
        <select id="chercheur" v-model="chercheur">
          <option value="">— choisir —</option>
          <option v-for="c in chercheurs" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>

      <div v-if="chercheur" class="champ">
        <label for="depot">Ajouter des données</label>
        <input
          id="depot" ref="champFichier" type="file" multiple
          :disabled="depotEnCours" @change="deposer"
        />
      </div>

      <button v-if="chercheur" type="button" class="btn btn--neutre btn--petit"
              :disabled="chargement" @click="charger">
        {{ chargement ? 'Lecture…' : 'Rafraîchir' }}
      </button>
    </section>

    <p v-if="depotEnCours" class="message message--info" role="status">
      Dépôt en cours… {{ progression }} %
    </p>

    <section v-if="chercheur" class="bloc">
      <div class="bloc__entete">
        <h2>Données de {{ chercheur }}</h2>
        <span v-if="fichiers.length" class="total">
          {{ fichiers.length }} fichier(s) · {{ taille(totalOctets) }}
        </span>
      </div>

      <div class="tableau-cadre">
        <p v-if="!existe" class="vide">
          Aucun dossier de données pour ce compte. Il sera créé au premier dépôt.
        </p>
        <p v-else-if="!fichiers.length" class="vide">
          Aucune donnée. Ce chercheur ouvrira une session sur un dossier vide.
        </p>

        <table v-else class="tableau">
          <thead>
            <tr><th>Fichier</th><th>Taille</th><th>Déposé le</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="f in fichiers" :key="f.nom">
              <td class="mono">{{ f.nom }}</td>
              <td class="mono">{{ taille(f.taille) }}</td>
              <td class="mono">{{ dateFichier(f.modifie_le) }}</td>
              <td class="actions">
                <a class="btn btn--neutre btn--petit"
                   :href="api.urlFichier(chercheur, 'donnees', f.nom)">
                  Récupérer
                </a>
                <button type="button" class="btn btn--danger btn--petit"
                        :disabled="suppression === f.nom" @click="retirer(f.nom)">
                  {{ suppression === f.nom ? 'Retrait…' : 'Retirer' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <p v-else class="vide">
      Choisissez un chercheur pour voir et modifier les données qui lui sont
      destinées.
    </p>
  </div>
</template>

<style scoped lang="scss">
.vue { display: flex; flex-direction: column; gap: $r-4; }

.barre {
  display: flex;
  align-items: flex-end;
  gap: $r-4;
  flex-wrap: wrap;

  .champ { min-width: 220px; }
  .btn { white-space: nowrap; }
}

.bloc {
  display: flex;
  flex-direction: column;
  gap: $r-3;

  &__entete {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: $r-3;
  }
}

.total {
  @include mono(12.5px);
  color: $ink-3;
}

.actions {
  display: flex;
  gap: $r-2;
  justify-content: flex-end;
  white-space: nowrap;
}
</style>
