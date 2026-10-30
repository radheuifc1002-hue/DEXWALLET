FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY worker.mjs ./
USER node
CMD ["node", "worker.mjs"]
