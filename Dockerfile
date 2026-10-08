# Frontend image for Cloud Run. Build context is the checked standalone build:
#   npm run build && docker build -f Dockerfile --build-arg REWIRE_FRONTEND_VERSION=<commit> build/web
# The image holds code only. The revision's REWIRE_DATA_PIN selects the data
# release, which the entrypoint fetches and verifies at startup.
FROM node:24-bookworm-slim
ARG REWIRE_FRONTEND_VERSION
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8080 \
    REWIRE_FRONTEND_VERSION=${REWIRE_FRONTEND_VERSION}
WORKDIR /app
COPY --chown=node:node . .
USER node
EXPOSE 8080
CMD ["node", "runtime/scripts/server-entry.mjs"]
