# =============================================================================
# Dockerfile — production-збірка React-фронтенду SkillSwap
# =============================================================================
# Multi-stage build:
#   Stage 1 (build)  — встановлює залежності, робить `npm run build`
#   Stage 2 (runtime) — лише nginx + готова статика, без node_modules
#                       (фінальний образ важить мегабайти, а не сотні мегабайт)
# =============================================================================

# ── Stage 1: збірка ──────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Спочатку копіюємо лише package*.json — Docker кешує цей шар, тож
# повторна збірка без зміни залежностей не качає npm install щоразу.
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: production runtime ──────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

# Прибираємо дефолтний конфіг nginx і ставимо свій
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Копіюємо готову статичну збірку з першого stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
