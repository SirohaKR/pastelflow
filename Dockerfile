# ── 1단계: 패키지 받기 + 화면 빌드 ──
FROM node:24-alpine AS build
WORKDIR /app
# NAS 에서 IPv6 연결이 불안정하면 내려받기가 시간 초과로 끊기므로 IPv4 를 먼저 쓴다
ENV NODE_OPTIONS=--dns-result-order=ipv4first \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=600000 \
    npm_config_audit=false \
    npm_config_fund=false
COPY package.json package-lock.json ./
# 받은 패키지는 캐시에 남겨서 다시 빌드할 때 또 받지 않는다
RUN --mount=type=cache,target=/root/.npm npm ci --prefer-offline
COPY . .
# 화면을 빌드한 뒤, 실행에 필요 없는 개발용 패키지는 뺀다 (다시 내려받지 않음)
RUN npm run build && npm prune --omit=dev

# ── 2단계: 실행 ──
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=5210 \
    DATA_DIR=/data
WORKDIR /app
RUN apk add --no-cache su-exec
COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY server ./server
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data
EXPOSE 5210
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:5210/api/auth/status >/dev/null || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
