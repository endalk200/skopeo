# syntax=docker/dockerfile:1.20@sha256:26147acbda4f14c5add9946e2fd2ed543fc402884fd75146bd342a7f6271dc1d
FROM oven/bun:1.3.14-slim@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04 AS bun-base
RUN bun add --global turbo@2.10.5

FROM bun-base AS pruner
WORKDIR /repo
COPY . .
RUN turbo prune @skopeo/api --docker

FROM oven/bun:1.3.14-slim@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04 AS build
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
COPY --from=pruner /repo/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile --ignore-scripts
COPY --from=pruner /repo/out/full/ .
RUN ./node_modules/.bin/turbo run build --filter=@skopeo/api
RUN find apps/api/dist -type f \( -name '*.d.ts' -o -name '*.d.ts.map' \) -delete

FROM oven/bun:1.3.14-slim@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04 AS production-dependencies
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
COPY --from=pruner /repo/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile --ignore-scripts --omit=dev --omit=optional

FROM node:26-trixie-slim@sha256:ffc78385a788964bb3cbab5e434ff79a10bdc25b8ae6db03fe5fe6cb14053c09 AS runtime
ARG VERSION=dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="Skopeo Platform API" \
	org.opencontainers.image.description="Hosted API for Skopeo code review workflows" \
	org.opencontainers.image.source="https://github.com/endalk200/skopeo" \
	org.opencontainers.image.revision="${REVISION}" \
	org.opencontainers.image.version="${VERSION}" \
	org.opencontainers.image.licenses="MIT"

RUN rm -rf /opt/yarn-* /usr/local/lib/node_modules/corepack /usr/local/lib/node_modules/npm \
	&& rm -f /usr/local/bin/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg

ENV HOST=0.0.0.0 \
	NODE_ENV=production \
	PORT=4000
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /repo/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /repo/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /repo/apps/api/drizzle ./apps/api/drizzle
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
	CMD ["node", "-e", "fetch('http://127.0.0.1:4000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["node"]
CMD ["apps/api/dist/index.js"]
