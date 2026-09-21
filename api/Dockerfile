FROM node:26-alpine3.23 AS build

WORKDIR /api

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:26-alpine3.23 AS production

WORKDIR /api

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=node:node /api/dist ./dist

USER node
EXPOSE 3000

CMD ["node", "dist/main.js"]
