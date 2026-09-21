FROM node:26-alpine3.23

WORKDIR /api

ENV NODE_ENV=production

COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

COPY --chown=node:node . .

USER node
EXPOSE 3000

CMD ["npm", "start"]
