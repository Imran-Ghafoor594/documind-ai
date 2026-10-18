FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OMP_THREAD_LIMIT=1
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng \
    && tesseract --version && tesseract --list-langs \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt constraints.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Persistent disk is supplied by Render at runtime, not during docker build.
ENV UPLOAD_DIR=/var/data/uploads
# One worker is mandatory: startup recovery and processing semaphore are process-local.
# Threads keep health checks responsive while the single OCR slot is occupied.
CMD ["sh", "-c", "exec gunicorn run:app --bind 0.0.0.0:${PORT:-10000} --workers 1 --worker-class gthread --threads 4 --timeout 180 --graceful-timeout 30 --access-logfile - --error-logfile -"]
