FROM node:22-alpine AS dashboard
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/requirements.lock backend/requirements.lock
RUN pip install --no-cache-dir -r backend/requirements.lock
COPY backend backend
COPY instrumentation instrumentation
COPY sample_ai_app sample_ai_app
COPY --from=dashboard /frontend/dist /app/static
RUN useradd --create-home opspilot && mkdir -p /data && chown opspilot:opspilot /data
USER opspilot
ENV DATABASE_URL=sqlite:////data/opspilot.db STATIC_DIR=/app/static
EXPOSE 8000
CMD ["python", "-m", "backend.app.serve"]
