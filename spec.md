# Specification Document: UAP Incident Topic Explorer

## 1. Overview

The **UAP Incident Topic Explorer** is a full-stack web application that ingests
heterogeneous incident report documents (PDF, DOCX, TXT, CSV, PNG, JPG), performs
topic modeling and anomaly detection, and presents the results in an interactive,
single-pane glassmorphism interface. The system enables users to "fly through" a
corpus of documents using a 3D scatter plot (UMAP reduction), detect trends over
time, correlate disparate datasets, and visualise geographic and temporal patterns
when the data contains latitude, longitude, and date information.

## 2. System Architecture

A **client-server** architecture:

- **Backend** – Python 3.11+ with FastAPI, SQLAlchemy, and ML/NLP libraries
  (BERTopic, Sentence-Transformers, UMAP, HDBSCAN, scikit-learn). Provides REST
  APIs for file upload, document processing, topic modeling, and data retrieval.
- **Frontend** – Static HTML/CSS/JavaScript served by the backend. Uses Plotly.js
  for 3D scatter plots and 2D animated maps, Chart.js for trend lines, and custom
  glassmorphism CSS.
- **Database** – SQLite (via SQLAlchemy) stores document metadata, extracted text,
  topic assignments, anomaly scores, and geospatial fields.
- **File Storage** – `data/` with subfolders `raw/` (uploads), `processed/`, and
  `models/` (saved BERTopic pickle).

All components are containerisable via the provided `Dockerfile`.

## 3. Core Components

### 3.1 Backend Modules

| File | Responsibility |
|------|----------------|
| `backend/config.py` | Centralised paths, embedding model name, UMAP/HDBSCAN parameters, supported file extensions. |
| `backend/database.py` | SQLAlchemy ORM models (`Document`, `TopicWord`), engine, session factory. |
| `backend/ocr_utils.py` | Tesseract OCR wrapper for PNG/JPG images. |
| `backend/document_processor.py` | Parsers for PDF, DOCX, TXT, CSV (row-by-row with geo columns), images (OCR). |
| `backend/topic_modeler.py` | BERTopic pipeline: embeddings, UMAP (3D), HDBSCAN, Isolation Forest anomaly scoring. |
| `backend/main.py` | FastAPI app: upload, scan, process, viz-data, trends, correlation, geo-data; serves frontend. |
| `run.py` | Launches Uvicorn with hot-reload for development. |

### 3.2 Frontend Files

| File | Responsibility |
|------|----------------|
| `frontend/index.html` | Glassmorphism layout, upload zone, tab bar, 3D plot, sidebar, trend chart, correlation modal. |
| `frontend/style.css` | Frosted glass effects, responsive grid, tabs, modal, Plotly theme overrides. |
| `frontend/script.js` | File upload, API calls, 3D topic plot, anomalies, keywords, trends, geographic 3D/2D views. |

## 4. Data Models

### 4.1 `Document` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer (PK) | Auto-increment |
| `filename` | String | Original file name |
| `original_path` | String (unique) | Path or virtual row id (`file.csv:rowN`) |
| `extracted_text` | Text | Full plain text content |
| `text_preview` | String(500) | Truncated preview |
| `file_type` | String | Extension or `"csv_row"` |
| `ingestion_date` | DateTime | UTC insertion timestamp |
| `source_dataset` | String | `"web_upload"`, `"raw_folder"`, etc. |
| `has_ocr` | Boolean | True if text came from OCR |
| `doc_date` | DateTime | File mtime or CSV `date posted` |
| `topic_id` | Integer | -1 = outlier, >=0 = topic |
| `anomaly_score` | Float | 0 (normal) to 1 (anomaly) |
| `latitude` | Float | Geographic coordinate |
| `longitude` | Float | Geographic coordinate |
| `incident_shape` | String(50) | e.g. "triangle", "disc" |
| `comment_length` | Integer | Length of comment/text field |
| `country` | String(10) | Country code |
| `state_code` | String(10) | State/province |
| `verified` | Boolean | Whether report is verified |
| `year_month` | String(7) | `YYYY-MM` for animation |

Indexes: `(latitude, longitude)`, `(year_month)`.

### 4.2 `TopicWord` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | Integer (PK) | Auto-increment |
| `topic_id` | Integer | Indexed BERTopic topic |
| `word` | String | Keyword |
| `score` | Float | c-TF-IDF score |

## 5. Document Processing Pipeline

### 5.1 Ingestion Flow

1. Upload via drag-and-drop, file picker, or by placing files in `data/raw/`.
2. PDF/DOCX/TXT/Image → extract text, create one `Document`. CSV → one `Document`
   per non-empty row, copying geographic/time columns when present; `original_path`
   becomes `filepath:rowN` to avoid duplicates.
3. PNG/JPG → Tesseract OCR, stored with `has_ocr=True`.
4. `doc_date` from file mtime (non-CSV) or CSV `date posted` column.
5. Committed to SQLite. No topic modeling yet.

### 5.2 Topic Modeling & Anomaly Detection

Triggered via **"Run Topic Modeling"**:

- Load documents with non-empty `extracted_text`.
- Sentence-Transformer (`all-MiniLM-L6-v2`) embeddings.
- UMAP to 3 dimensions.
- HDBSCAN (min_cluster_size=3) → topic or `-1`.
- BERTopic c-TF-IDF keywords saved in `TopicWord`.
- Isolation Forest on embeddings → 0–1 anomaly score. `topic_id = -1` or score
  > 0.7 flagged as anomalies.
- Trained pipeline pickled to `data/models/bertopic_model.pkl`.

## 6. Visualization & Interaction

### 6.1 Topic Landscape (Default Tab)
3D scatter (UMAP axes), colour per topic, anomalies highlighted, hover tooltip,
fly-through controls, Reset Camera, sidebar with keywords and top anomalies.

### 6.2 Trend Analysis
`/trends` aggregates documents by month and topic; rendered as a Chart.js
multi-series line chart.

### 6.3 Cross-Dataset Correlation
`/correlation` computes mean embedding per dataset and returns cosine similarity,
shown in a modal.

## 7. Geographic & Temporal Extension (CSV-driven)

When CSV files contain `latitude`, `longitude`, `date posted`, `shape`,
`comment_length`, `country`, `state`, `verified`, the system populates the
corresponding `Document` fields, enabling the **Geographic Spacetime** tab.

### 7.1 Data Endpoint
`GET /geo-data` returns all documents with non-null latitude/longitude.

### 7.2 Sub-Modes
- **3D Scatter** – X = timestamp, Y = longitude, Z = latitude; colour = shape;
  marker size = comment_length (3–15 px).
- **2D Animated Map** – lat/lon scatter animated by `year_month` with play button
  and time slider.

### 7.3 Controls
A dropdown toggles between "3D Scatter (Lat, Lon, Time)" and "2D Animated Map
(Time slider)". Both rendered with Plotly.js.

## 8. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Returns `frontend/index.html` |
| POST | `/upload` | Stores files in `data/raw/` and ingests them. |
| POST | `/scan-raw` | Scans `data/raw/` for new files. |
| POST | `/process` | Runs full topic modeling pipeline. |
| GET | `/viz-data` | Documents with 3D UMAP coordinates, topics, anomaly scores, keywords. |
| GET | `/trends` | Monthly document counts per topic. |
| GET | `/correlation` | `dataset_a`, `dataset_b` → cosine similarity. |
| GET | `/geo-data` | Geographic/time metadata for documents with lat/lon. |

## 9. Frontend UI

Glassmorphism dark theme (`rgba(20,30,45,0.45)` panels, 16px blur, neon accent
`#5f9eff`), responsive flex/grid, header, upload area, button bar, stats row, tab
bar (Topic Landscape / Geographic Spacetime), interactive Plotly plot + sidebar,
and a centred correlation modal.

## 10. Deployment

### Local
```bash
git clone https://github.com/dascient/UAP.git
cd UAP
pip install -r requirements.txt
python run.py
```
Open `http://localhost:8000`. Tesseract must be installed separately.

### Docker
```bash
docker build -t uap-explorer .
docker run -p 8000:8000 -v $(pwd)/data:/app/data uap-explorer
```

### Production
Replace SQLite with PostgreSQL, front with nginx, set `reload=False`, add Uvicorn
workers, and tune UMAP/HDBSCAN/embeddings for large corpora.

## 11. Future Enhancements
Real-time folder streaming, authentication, full-text search, export, advanced
filters, custom embeddings, LLM topic summarisation.
