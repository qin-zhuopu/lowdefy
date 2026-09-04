# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Lowdefy CI ("Jenkins-like") app container.
#
# This app is a Lowdefy YAML app in app/ backed by the custom server-side
# connection plugin @lowdefy/connection-shell-runner, which uses better-sqlite3
# (a native module) and spawns real `bash` child processes. Because of that we
# need:
#   * Node 22 on a Debian base (node:22-bookworm-slim) so `bash` is present
#     (Alpine ships only `sh`, which would break the runner).
#   * A C/C++ toolchain (python3, make, g++) to compile better-sqlite3 during
#     `pnpm install`.
#
# The production build is produced INSIDE the image by `pnpm app:build`, which:
#   1. builds the whole monorepo,
#   2. copies packages/servers/server into _server/prod,
#   3. rewrites @lowdefy/* deps to link: paths back into the monorepo,
#   4. installs + runs `lowdefy build` + `next build`.
# _server/prod therefore contains link: symlinks into the monorepo packages, so
# the monorepo must remain present at runtime. We keep everything in a single
# stage to preserve those links.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim

# bash: required by the shell-runner connection to execute jobs.
# python3/make/g++: required to build the better-sqlite3 native addon.
# ca-certificates: TLS for the npm registry.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

# Enable the pnpm version pinned by package.json "packageManager".
RUN corepack enable

# Writable location for the ephemeral SQLite database. Render's free tier disk
# is ephemeral (wiped on restart/redeploy/sleep) which is acceptable here.
# getDb.js reads LOWDEFY_JENKINS_DB and mkdir -p's the parent directory.
ENV LOWDEFY_JENKINS_DB=/data/jenkins.sqlite
RUN mkdir -p /data

WORKDIR /app

# Copy the full monorepo (build context; app/** is present in the working tree).
COPY . .

# Install workspace dependencies (compiles better-sqlite3 via the toolchain
# above) and produce the production build in _server/prod.
RUN pnpm install --frozen-lockfile \
  && pnpm app:build

# Render injects PORT; the app must listen on 0.0.0.0:$PORT. `next start`
# (invoked by app:start) honours PORT and binds all interfaces by default.
ENV PORT=3000
EXPOSE 3000

# start.mjs checks _server/prod/.next exists then runs `pnpm run start` in
# _server/prod, forwarding PORT.
CMD ["sh", "-c", "pnpm app:start --port ${PORT}"]
