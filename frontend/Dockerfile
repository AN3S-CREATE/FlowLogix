# ---- Build stage: compile the Vite/React SPA to static assets ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ---- Serve stage: Nginx serving the SPA + acting as the API load balancer ----
FROM nginx:1.27-alpine AS production

# Load-balancer + SPA server config (round-robin upstream, SSL, WS upgrade).
COPY nginx.conf /etc/nginx/nginx.conf

# Static bundle produced by `vite build`.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
