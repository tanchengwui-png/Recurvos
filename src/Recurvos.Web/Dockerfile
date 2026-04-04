FROM node:24-alpine AS build
WORKDIR /app
ARG VITE_API_BASE_URL=http://localhost:7001/api
ARG VITE_PUBLIC_SITE_URL=https://recurvos.com
ARG VITE_APP_SITE_URL=https://app.recurvos.com
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_PUBLIC_SITE_URL=$VITE_PUBLIC_SITE_URL
ENV VITE_APP_SITE_URL=$VITE_APP_SITE_URL
COPY src/Recurvos.Web/package*.json ./
RUN npm install
COPY src/Recurvos.Web/ .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY src/Recurvos.Web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
