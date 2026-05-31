# UAP Incident Topic Explorer container image
FROM python:3.11-slim

# System dependencies: Tesseract OCR engine + build tools for ML wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        libtesseract-dev \
        build-essential \
        libgl1 \
        libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first to leverage Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY backend ./backend
COPY frontend ./frontend
COPY run.py ./run.py

# Persisted data (uploads, processed files, models, SQLite DB)
RUN mkdir -p data/raw data/processed data/models

EXPOSE 8000

# Production launch (no reload). Mount a volume at /app/data to persist state.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
