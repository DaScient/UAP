import os
from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"
PROCESSED_DIR = DATA_DIR / "processed"
MODEL_DIR = DATA_DIR / "models"
DB_PATH = DATA_DIR / "incident.db"

# Ensure directories exist
for d in [DATA_DIR, RAW_DIR, PROCESSED_DIR, MODEL_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Embedding model for topic modeling
EMBEDDING_MODEL = "all-MiniLM-L6-v2"   # fast & good for general domain

# BERTopic parameters
UMAP_DIMS = 3          # 3D for visualization
HDBSCAN_MIN_CLUSTER_SIZE = 3
HDBSCAN_MIN_SAMPLES = 2

# OCR
TESSERACT_CMD = "tesseract"   # or full path if needed

# Supported file extensions
SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".csv", ".png", ".jpg", ".jpeg"}
