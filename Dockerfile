# Build context = repo root; the app and its static assets (web/public) are all under web/.
# Base image is pinned by digest so builds are repeatable; the weekly Security audit workflow scans it and Dependabot proposes bumps.
ARG NODE=node:22-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d

FROM ${NODE} AS build
WORKDIR /app
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Runtime: production dependencies only, no compilers or dev tools, and not root.
FROM ${NODE}
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node web/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force && chown node:node /app
# data/ is read at start (page seeds) and written by the first-run setup wizard (data/config.json); /app/config is the docker-compose volume.
# .next/cache is written by the image optimizer. All three must belong to the unprivileged user.
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/data ./data
COPY --from=build --chown=node:node /app/workers ./workers
COPY --from=build --chown=node:node /app/next.config.mjs ./
RUN mkdir -p /app/config && chown node:node /app/config
USER node
EXPOSE 3000
CMD ["npm", "start"]
