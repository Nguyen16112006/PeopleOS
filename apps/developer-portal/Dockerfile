# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 PeopleOS contributors

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_KEYCLOAK_URL=http://localhost:8080
ARG VITE_PLATFORM_API=http://localhost:9080/platform
ARG VITE_GATEWAY_URL=http://localhost:9080
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL VITE_PLATFORM_API=$VITE_PLATFORM_API VITE_GATEWAY_URL=$VITE_GATEWAY_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
