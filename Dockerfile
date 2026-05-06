FROM oven/bun:1.1-alpine
WORKDIR /app
COPY package.json ./
RUN bun install --production || true
COPY tsconfig.json ./
COPY src ./src
ENV NODE_ENV=production
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:${LISTEN_PORT:-8787}/health || exit 1
CMD ["bun", "run", "start"]
