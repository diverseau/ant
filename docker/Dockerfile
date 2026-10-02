# Ported from hermes-agent Dockerfile @ 54bc5e50 (MIT, Nous Research)
FROM node:26-bookworm-slim AS build
WORKDIR /opt/ant
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
COPY web/package.json web/package.json
COPY server/package.json server/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ant-mcp/package.json packages/ant-mcp/package.json
RUN npm ci --no-audit --no-fund
COPY web/ web/
COPY packages/shared/ packages/shared/
RUN npm -w web run build
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:26-bookworm-slim AS runtime
SHELL ["/bin/bash", "-euo", "pipefail", "-c"]
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        bubblewrap ca-certificates chromium chromium-sandbox curl fonts-dejavu-core \
        fonts-liberation fonts-noto-color-emoji git python3 socat tini \
    && rm -rf /var/lib/apt/lists/*

# The Node image already has uid/gid 1000. Seed volume ownership at build time;
# the entrypoint runs unprivileged and never recursively chowns mounted files.
RUN groupmod --new-name ant node \
    && usermod --login ant --home /home/ant --move-home node \
    && install -d -o ant -g ant -m 0700 \
        /home/ant/Ants /home/ant/.local /home/ant/.local/bin \
        /home/ant/.local/share /home/ant/.local/share/ant /home/ant/.claude \
    && ln -s /home/ant/.claude/.claude.json /home/ant/.claude.json

ENV HOME=/home/ant \
    PATH=/home/ant/.local/bin:$PATH \
    LANG=C.UTF-8 \
    NODE_ENV=production \
    ANT_HOME=/home/ant/Ants \
    ANT_DATA_DIR=/home/ant/.local/share/ant \
    ANT_SOCKET=/home/ant/.local/share/ant/antd.sock \
    ANT_HOST=0.0.0.0 \
    ANT_PORT=7420 \
    ANT_IN_CONTAINER=1 \
    CLAUDE_CONFIG_DIR=/home/ant/.claude \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Only the native CLI binaries are installed here; no login during the build.
USER ant:ant
RUN curl -fsSL https://claude.ai/install.sh | bash \
    && claude --version

USER root
WORKDIR /opt/ant
COPY --from=build /opt/ant/node_modules/ node_modules/
COPY --from=build /opt/ant/web/dist/ web/dist/
COPY package.json ./
COPY server/ server/
COPY packages/ packages/
COPY scripts/backup.sh scripts/restore.sh scripts/
COPY docker/entrypoint.sh /usr/local/bin/ant-entrypoint
RUN chmod 0755 /usr/local/bin/ant-entrypoint scripts/backup.sh scripts/restore.sh

USER ant:ant
EXPOSE 7420
# Subreaper mode also works when Compose's init owns PID 1.
ENTRYPOINT ["/usr/bin/tini", "-s", "--", "/usr/local/bin/ant-entrypoint"]
CMD ["node", "server/src/main.ts"]
