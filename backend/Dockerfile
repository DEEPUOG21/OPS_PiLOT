FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY backend/requirements.lock backend/requirements.lock
RUN pip install --no-cache-dir -r backend/requirements.lock
COPY backend backend
COPY instrumentation instrumentation
COPY sample_ai_app sample_ai_app
RUN useradd --create-home opspilot && mkdir -p /data && chown opspilot:opspilot /data
USER opspilot
ENV DATABASE_URL=sqlite:////data/opspilot.db
EXPOSE 8000
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
