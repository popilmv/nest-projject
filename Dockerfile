# syntax=docker/dockerfile:1

############################
# deps: install dependencies
############################
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

############################
# build: compile TS + prune dev deps
############################
FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build
RUN npm prune --omit=dev

############################
# dev: hot reload
############################
FROM node:20-alpine AS dev
WORKDIR /app

ENV NODE_ENV=development

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000
CMD ["npm", "run", "start:dev"]

############################
# prod: minimal runtime (alpine)
############################
FROM node:20-alpine AS prod
WORKDIR /app

ENV NODE_ENV=production

# Run as non-root (node user exists in official node images)
USER node

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/proto ./proto

EXPOSE 3000
CMD ["node", "dist/main.js"]

############################
# prod-distroless: minimal runtime (no shell)
############################
FROM gcr.io/distroless/nodejs20-debian12:nonroot AS prod-distroless

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=65532:65532 /app/dist ./dist
COPY --from=build --chown=65532:65532 /app/node_modules ./node_modules
COPY --from=build --chown=65532:65532 /app/package.json ./package.json
COPY --from=build --chown=65532:65532 /app/proto ./proto

EXPOSE 3000
CMD ["dist/main.js"]
