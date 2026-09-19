# Console d'administration de l'enclave sécurisée

Administration des accès et supervision de l'**enclave sécurisée d'accès aux
données** de l'INSTAD — Institut de la Statistique de Djibouti.

Des chercheurs analysent des données confidentielles avec R, RStudio et Stata
sans jamais pouvoir les extraire. Cette console pilote les accès, surveille les
sessions et porte le **circuit de sortie** : l'examen des résultats déposés
avant leur transmission hors de l'enclave.

## Ce que la console couvre

| Écran | Rôle |
|---|---|
| **Vue d'ensemble** | accès actifs, sessions en cours, écarts à trancher, état du modèle |
| **Accès chercheurs** | provisionner, changer un mot de passe, révoquer |
| **Sessions en cours** | clones vivants, durée, fermeture forcée |
| **Circuit de sortie** | consulter les dépôts et récupérer les fichiers à valider |
| **Réconciliation** | écarts entre la base Samba et le registre local |
| **Journal d'audit** | qui a fait quoi, quand — en ajout seul |

## Architecture

```
navigateur ──HTTPS 8443──▶ Nginx ──▶ API Node (127.0.0.1:8090)
   (restreint par IP)                      │
                                           ├──SSH commande forcée──▶ agent Samba (fileserver)
                                           └──API──▶ Proxmox
```

**Deux services séparés, délibérément.** La console détient la clé de l'agent
Samba ; le portail chercheur — exposé aux utilisateurs — ne l'a pas. Une
compromission du portail ne permet donc ni de créer ni de modifier un accès.

**Les agents ne font pas confiance à leur appelant.** Ils n'acceptent aucune
commande : seulement des champs validés, à partir desquels ils reconstruisent
eux-mêmes chemins et fichiers de configuration.

## Sécurité

- Mots de passe d'administration en **scrypt**, comparaison à temps constant
- Cookie de session **`httpOnly` + `secure` + `SameSite=Strict`**
- En-tête **`X-Console`** exigé sur toute écriture — protection CSRF
- Blocage après 5 tentatives ; message identique que le compte existe ou non
- L'API n'écoute que sur la **boucle locale** ; Nginx restreint par IP
- **Aucun secret dans l'image** : jeton, clés et `ADMIN_SECRET` sont injectés
  à l'exécution
- Le journal d'audit **refuse d'écrire** mot de passe, empreinte ou jeton
- Toute récupération de fichier est **journalisée**

## Démarrage

```bash
# Construction
docker build -t nejishow/enclave-admin:latest .

# Déploiement
cp .env.exemple .env      # renseigner ADMIN_SECRET et PROXMOX_TOKEN
docker compose up -d

# Premier administrateur (saisie masquée)
docker compose exec admin node creer-admin.js <identifiant> "Nom affiché"
```

Nginx et systemd : voir `deploiement-nginx.conf` et
`deploiement-systemd.service`.

## Développement

```bash
cd console && npm install && npm run dev    # http://localhost:5180
cd serveur && node index.js                 # http://127.0.0.1:8090
```

Vue 3 · TypeScript · Composition API · SCSS · Pinia · Vite — côté serveur
Node 22 et Express 5, sans dépendance de chiffrement externe (`scrypt` et
`timingSafeEqual` viennent de la plateforme).
