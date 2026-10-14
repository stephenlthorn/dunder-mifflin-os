# Dunder Mifflin OS in a container. Stage 1 builds the same npm package `npx dunder-mifflin-os` installs (prepack
# builds the web app); stage 2 installs only that package into a small image that runs as the unprivileged `node`
# user (uid 1000) and writes nothing to disk, so it works with a read-only root filesystem.
#
#   docker build -t dunder-mifflin-os .
#   docker run --rm -p 127.0.0.1:4318:4318 dunder-mifflin-os --demo     # the demo day: no token, no Hermes
#
# Inside a container the server must listen on 0.0.0.0, which counts as remote: for live data it refuses to start
# without DMOS_ACCESS_TOKEN (the demo, all fiction, needs none). See docker-compose.yml for live data (~/.hermes
# mounted read-only).

ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --no-audit --no-fund
COPY . .
RUN mkdir /out && npm pack --pack-destination /out

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    DMOS_HOST=0.0.0.0 \
    DMOS_PORT=4318 \
    HERMES_HOME=/hermes \
    DMOS_PORTRAITS_DIR=/portraits \
    DMOS_HEADSHOTS_DIR=/headshots \
    TSX_DISABLE_CACHE=1
COPY --from=build /out/ /tmp/pkg/
RUN npm install --global --omit=dev --no-audit --no-fund /tmp/pkg/dunder-mifflin-os-*.tgz \
 && npm cache clean --force \
 && rm /tmp/pkg/dunder-mifflin-os-*.tgz
USER 1000:1000
WORKDIR /home/node
EXPOSE 4318
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.DMOS_PORT||4318)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["dunder-mifflin-os"]
