FROM node:26-alpine3.23 AS build

WORKDIR /api

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:26-alpine3.23 AS production

WORKDIR /api

ENV NODE_ENV=production
ENV PYTHON_BIN=/opt/venv/bin/python
ENV PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt ./
RUN apk add --no-cache python3 py3-pip \
    && python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=node:node /api/dist ./dist

COPY --chown=node:node python_script/isbn_scrap.py ./python_script/isbn_scrap.py

USER node
EXPOSE 3000

CMD ["node", "dist/main.js"]
