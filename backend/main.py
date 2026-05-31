from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import shutil
from pathlib import Path
from backend.config import RAW_DIR, PROCESSED_DIR, MODEL_DIR
from backend.document_processor import ingest_file, ingest_all_raw_files
from backend.topic_modeler import retrain_full_pipeline, TopicModeler
from backend.database import SessionLocal, Document, TopicWord
import numpy as np
import json

app = FastAPI(title="UAP Incident Topic Explorer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static frontend
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")

@app.get("/")
async def root():
    # Serve index.html
    index_file = frontend_path / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Frontend not found, please place index.html in frontend/"}

@app.post("/upload")
async def upload_files(files: list[UploadFile] = File(...), background_tasks: BackgroundTasks = None):
    saved = []
    for file in files:
        file_path = RAW_DIR / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        doc_id = ingest_file(file_path, source_dataset="web_upload")
        if doc_id != -1:
            saved.append({"filename": file.filename, "id": doc_id})
    return {"uploaded": saved}

@app.post("/scan-raw")
async def scan_raw_folder():
    ingest_all_raw_files()
    return {"status": "scanned data/raw directory"}

@app.post("/process")
async def process_all():
    try:
        result = retrain_full_pipeline()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/viz-data")
async def get_visualization_data():
    db = SessionLocal()
    docs = db.query(Document).all()
    if not docs:
        db.close()
        return {"points": [], "topics": []}
    
    modeler = TopicModeler()
    modeler.load_documents_from_db()
    coords = modeler.get_3d_coordinates()
    if coords is None:
        db.close()
        return {"error": "No trained model. Run /process first."}
    
    points = []
    topics_set = set()
    for i, doc in enumerate(docs):
        if i >= len(coords):
            continue
        x, y, z = float(coords[i][0]), float(coords[i][1]), float(coords[i][2])
        topic = int(doc.topic_id) if doc.topic_id is not None else -1
        topics_set.add(topic)
        points.append({
            "id": doc.id,
            "x": x, "y": y, "z": z,
            "topic": topic,
            "filename": doc.filename,
            "preview": doc.text_preview[:200],
            "anomaly_score": doc.anomaly_score,
            "source_dataset": doc.source_dataset,
            "doc_date": doc.doc_date.isoformat() if doc.doc_date else None,
            "is_anomaly": topic == -1 or doc.anomaly_score > 0.7
        })
    db.close()
    
    # Gather topic keywords
    db2 = SessionLocal()
    topic_keywords = {}
    for tid in topics_set:
        words = db2.query(TopicWord).filter(TopicWord.topic_id == tid).order_by(TopicWord.score.desc()).limit(5).all()
        topic_keywords[int(tid)] = [w.word for w in words]
    db2.close()
    
    return {"points": points, "topics_keywords": topic_keywords}

@app.get("/trends")
async def get_trends():
    db = SessionLocal()
    docs = db.query(Document).filter(Document.doc_date.isnot(None)).all()
    # Simple aggregation: count of topics per month
    from collections import defaultdict
    monthly = defaultdict(lambda: defaultdict(int))
    for doc in docs:
        if doc.doc_date and doc.topic_id != -1:
            month_key = doc.doc_date.strftime("%Y-%m")
            monthly[month_key][doc.topic_id] += 1
    db.close()
    # Convert to lists for frontend
    months = sorted(monthly.keys())
    topics = set()
    for m in months:
        topics.update(monthly[m].keys())
    topics = sorted(topics)
    data = []
    for t in topics:
        series = [monthly[m].get(t, 0) for m in months]
        data.append({"topic": t, "data": series})
    return {"months": months, "series": data}

@app.get("/correlation")
async def get_correlation(dataset_a: str = "web_upload", dataset_b: str = "raw_folder"):
    """Compute cosine similarity between embeddings of two datasets."""
    modeler = TopicModeler()
    modeler.load_documents_from_db()
    if modeler.topic_model is None:
        modeler.fit()
    embeddings = modeler.topic_model.embeddings_
    db = SessionLocal()
    docs_a = db.query(Document).filter(Document.source_dataset == dataset_a).all()
    docs_b = db.query(Document).filter(Document.source_dataset == dataset_b).all()
    db.close()
    if not docs_a or not docs_b:
        return {"error": "One or both datasets empty"}
    
    # Get indices
    indices_a = [modeler.doc_ids.index(d.id) for d in docs_a if d.id in modeler.doc_ids]
    indices_b = [modeler.doc_ids.index(d.id) for d in docs_b if d.id in modeler.doc_ids]
    if not indices_a or not indices_b:
        return {"error": "No overlapping embeddings"}
    
    emb_a = embeddings[indices_a]
    emb_b = embeddings[indices_b]
    # Mean embedding per dataset
    mean_a = np.mean(emb_a, axis=0)
    mean_b = np.mean(emb_b, axis=0)
    # Cosine similarity
    sim = np.dot(mean_a, mean_b) / (np.linalg.norm(mean_a) * np.linalg.norm(mean_b))
    return {"similarity": float(sim), "dataset_a": dataset_a, "dataset_b": dataset_b}
