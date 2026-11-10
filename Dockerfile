FROM node:22-alpine AS frontend-build
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.13-slim AS app
WORKDIR /app/backend
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FRONTEND_DIST_DIR=/app/frontend-dist
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend-build /workspace/dist/ /app/frontend-dist/
CMD ["sh", "-c", "gunicorn --worker-class gthread --workers 1 --threads 100 --timeout 120 --bind 0.0.0.0:${PORT:-10000} app:app"]
