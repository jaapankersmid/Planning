# Dockerfile voor het zelf hosten van de rooster-app op een eigen server/VPS
# (bv. Hetzner Cloud). Zie README.md, sectie "Een echte omgeving hosten" →
# "Optie B — zelf hosten", en docker-compose.prod.yml voor hoe dit gebruikt
# wordt samen met Postgres en Caddy (reverse proxy + automatische HTTPS).
#
# Twee lagen:
#   1. "builder" — installeert ALLE dependencies (ook dev, nodig om te
#      bouwen) en draait `next build`.
#   2. "runner"  — installeert alleen productie-dependencies opnieuw (dat
#      laat `postinstall` (`prisma generate`) draaien tegen dít basisimage,
#      zodat de Prisma-engine altijd bij het besturingssysteem past waarop
#      de container ook echt draait) en kopieert de build-output erbij.
#
# Beide lagen gebruiken bewust hetzelfde basisimage (Debian-slim), zodat er
# geen mismatch kan ontstaan tussen bouwen en draaien.

FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Prisma's query-engine heeft openssl nodig om te kunnen draaien.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# package.json + prisma-schema eerst kopiëren, zodat `npm ci` hieronder de
# Prisma-client kan genereren (via het `postinstall`-script) vóórdat de rest
# van de broncode erbij komt — dat houdt Docker's laag-cache prettig warm.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/next.config.ts ./next.config.ts

EXPOSE 3000
CMD ["npm", "start"]
