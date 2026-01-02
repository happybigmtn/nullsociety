FROM node:20-slim AS build

WORKDIR /app/services/ops

COPY services/ops/package.json /app/services/ops/
COPY services/ops/package-lock.json /app/services/ops/
COPY services/ops/tsconfig.json /app/services/ops/
COPY services/ops/src /app/services/ops/src

RUN npm ci
RUN npm run build

FROM node:20-slim

WORKDIR /app/services/ops
ENV NODE_ENV=production

COPY services/ops/package.json /app/services/ops/
COPY services/ops/package-lock.json /app/services/ops/
RUN npm ci --omit=dev

COPY --from=build /app/services/ops/dist /app/services/ops/dist

RUN chown -R node:node /app/services/ops
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.OPS_PORT || 9020) + '/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
