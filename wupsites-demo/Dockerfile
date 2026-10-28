# Pizzarella Wuppertal – eigenständige Demo-Instanz für das WupSites-Vertriebsportal
#
# Aus der Wurzel des Repos bauen und starten:
#   docker build -f wupsites-demo/Dockerfile -t pizzarella-demo .
#   docker run -d -p 4321:4321 --name pizzarella-demo pizzarella-demo   → http://localhost:4321
#
# Gebaut wird exakt die Website aus diesem Repo (src/, public/, Daten), keine Kopie.
# Demo-Vorgabe: Bestellungen landen nur im Container (.orders/) und erreichen nie den Laden.
# Zugangsschutz und noindex gehören vor den Container, siehe wupsites-demo/README.md.

# Basis-Image austauschbar, z. B. über einen Spiegel: --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim
ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY astro.config.mjs tsconfig.json ./
COPY scripts/data-report.ts ./scripts/data-report.ts
COPY src ./src
COPY public ./public
RUN npm run build

FROM ${NODE_IMAGE}
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321 \
    ORDER_DEV_SINK=true
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p .orders && chown node:node .orders
USER node
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/order').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/server/entry.mjs"]
