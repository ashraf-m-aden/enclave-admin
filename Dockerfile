# =============================================================================
#  Console d'administration de l'enclave sécurisée — INSTAD
#
#  Deux étapes : la console Vue est construite, puis seuls ses fichiers
#  compilés partent dans l'image finale. Ni les sources, ni node_modules de
#  build, ni la chaîne TypeScript ne s'y retrouvent.
# =============================================================================

# --- Étape 1 : construction de la console ------------------------------------
FROM node:22-alpine AS console

WORKDIR /build

# Les dépendances d'abord : cette couche est réutilisée tant que le
# package.json ne change pas.
COPY console/package.json console/package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY console/ ./
RUN npm run build


# --- Étape 2 : image finale ---------------------------------------------------
FROM node:22-alpine

# tini : sans lui, Node tourne en PID 1 et n'y reçoit pas SIGTERM — le
# conteneur mettrait dix secondes à s'arrêter, à chaque fois.
# openssh-client : l'API parle aux agents contraints par commande forcée SSH.
# openssl : produit l'empreinte SHA-512-crypt ($6$) du mot de passe d'un
#   chercheur. Node ne sait pas la calculer — `scrypt` est un autre format —
#   et on n'écrit pas de cryptographie maison pour combler l'écart.
RUN apk add --no-cache tini openssh-client openssl

WORKDIR /app

COPY serveur/package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY serveur/ ./
COPY --from=console /build/dist ./console

# Compte non privilégié. L'image ne contient aucun secret : le jeton Proxmox,
# les clés SSH des agents et ADMIN_SECRET sont montés ou injectés à l'exécution.
RUN addgroup -g 10001 enclave \
 && adduser -D -u 10001 -G enclave enclave \
 && mkdir -p /app/etat \
 && chown -R enclave:enclave /app/etat

USER enclave

ENV NODE_ENV=production \
    ADMIN_PORT=8090 \
    ADMIN_HOTE=0.0.0.0 \
    ADMIN_COMPTES=/app/etat/administrateurs.json \
    ADMIN_JOURNAL=/app/etat/journal.jsonl \
    ORCHESTRATEUR_CHEMIN=/opt/enclave/orchestrateur/services

# Le registre des accès et le journal d'audit doivent survivre au conteneur.
VOLUME ["/app/etat"]

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.ADMIN_PORT||8090)+'/api/moi').then(r=>process.exit(r.status===401?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "index.js"]
