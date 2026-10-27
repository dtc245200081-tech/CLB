# ============================================================
# Stage 1: Base & Dependencies
# ============================================================
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install

# ============================================================
# Stage 2: Development (Hot-reload)
# ============================================================
FROM base AS development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

# ============================================================
# Stage 3: Builder for Production
# ============================================================
FROM base AS builder
COPY . .
RUN npm run build

# ============================================================
# Stage 4: Production (Nginx static files server)
# ============================================================
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
# Cấu hình Nginx nội bộ cho SPA routing (try_files $uri /index.html)
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
