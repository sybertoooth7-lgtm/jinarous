# Frontend - React/Vite, built to static assets and served by nginx.
#
# VITE_API_BASE_URL is baked in at BUILD time (Vite inlines env vars into
# the built JS), not at container runtime - pass it as a build arg:
#   docker build --build-arg VITE_API_BASE_URL=https://api.example.com .

FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM nginx:1.27-alpine AS serve
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
