# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

# npm ci requires a lockfile in this directory; the lockfile lives at the
# npm-workspaces root instead, so this uses npm install.
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ---- Production stage ----
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main"]
