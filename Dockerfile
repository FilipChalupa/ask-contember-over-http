FROM node:22-slim AS base
WORKDIR /app

FROM base AS install
COPY package.json package-lock.json* ./
RUN npm ci || npm install

FROM base
COPY --from=install /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

EXPOSE 3000
ENV PORT=3000
ENV SESSIONS_DIR=/data/sessions

VOLUME /data/sessions

CMD ["node", "--experimental-strip-types", "src/index.ts"]
