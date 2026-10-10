# Frontend image for Cloud Run. Build context is the checked standalone build:
#   npm run build && docker build -f Dockerfile --build-arg REWIRE_FRONTEND_VERSION=<commit> build/web
# The image embeds its data release under data/: the prepared SQLite file the
# pages and public catalogue API read, verified against the lock at build time
# and checked by the entrypoint at startup. A data release is a new image.
# Pulled through Google's Docker Hub mirror: anonymous pulls from shared CI runners hit Docker
# Hub's rate limit (HTTP 429) and fail the deploy.
FROM mirror.gcr.io/library/node:24-bookworm-slim
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
# A 2Gi instance serves up to 20 requests. Node's default heap limit lets garbage
# from large page renders grow past the instance memory before it is collected,
# and Cloud Run then kills the instance (503). The live heap stays well under this cap.
CMD ["node", "--max-old-space-size=768", "runtime/scripts/server-entry.mjs"]
