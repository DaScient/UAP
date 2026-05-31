import pickle
import numpy as np
from bertopic import BERTopic
from sentence_transformers import SentenceTransformer
from umap import UMAP
from hdbscan import HDBSCAN
from sklearn.ensemble import IsolationForest
from backend.database import SessionLocal, Document, TopicWord
from backend.config import EMBEDDING_MODEL, UMAP_DIMS, HDBSCAN_MIN_CLUSTER_SIZE, HDBSCAN_MIN_SAMPLES, MODEL_DIR

class TopicModeler:
    def __init__(self):
        self.embedding_model = SentenceTransformer(EMBEDDING_MODEL)
        self.topic_model = None
        self.documents = []
        self.texts = []
        self.doc_ids = []
        self.embeddings = None

    def load_documents_from_db(self):
        db = SessionLocal()
        docs = db.query(Document).filter(Document.extracted_text != "").all()
        self.documents = docs
        self.texts = [doc.extracted_text for doc in docs]
        self.doc_ids = [doc.id for doc in docs]
        db.close()
        return len(self.texts)

    def compute_embeddings(self):
        """Encode all loaded documents into dense embeddings (cached)."""
        if self.embeddings is None and self.texts:
            self.embeddings = self.embedding_model.encode(
                self.texts, show_progress_bar=False
            )
        return self.embeddings

    def fit(self):
        if len(self.texts) < 5:
            raise ValueError("Need at least 5 documents for topic modeling")

        # Pre-compute embeddings so they can be reused for anomaly detection
        # and cross-dataset correlation (BERTopic does not expose them itself).
        embeddings = self.compute_embeddings()

        # Reduce dimensionality for clustering
        umap_model = UMAP(n_components=UMAP_DIMS, random_state=42, n_neighbors=15)
        hdbscan_model = HDBSCAN(min_cluster_size=HDBSCAN_MIN_CLUSTER_SIZE,
                                min_samples=HDBSCAN_MIN_SAMPLES, prediction_data=True)
        self.topic_model = BERTopic(
            embedding_model=self.embedding_model,
            umap_model=umap_model,
            hdbscan_model=hdbscan_model,
            verbose=True
        )
        topics, probs = self.topic_model.fit_transform(self.texts, embeddings=embeddings)

        # Save model
        model_path = MODEL_DIR / "bertopic_model.pkl"
        with open(model_path, "wb") as f:
            pickle.dump(self.topic_model, f)

        # Update DB with topic assignments
        db = SessionLocal()
        for doc_id, topic in zip(self.doc_ids, topics):
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.topic_id = int(topic)
        db.commit()

        # Store topic words
        db.query(TopicWord).delete()
        topic_info = self.topic_model.get_topic_info()
        for _, row in topic_info.iterrows():
            topic_id = row["Topic"]
            if topic_id != -1:
                words = self.topic_model.get_topic(topic_id)
                if words:
                    for word, score in words[:10]:
                        tw = TopicWord(topic_id=int(topic_id), word=word, score=float(score))
                        db.add(tw)
        db.commit()
        db.close()

        # Compute anomaly scores using Isolation Forest on embeddings.
        # decision_function returns higher values for inliers; invert and
        # normalise to a 0 (normal) .. 1 (strong anomaly) range.
        iso_forest = IsolationForest(contamination=0.1, random_state=42)
        iso_forest.fit(embeddings)
        scores = iso_forest.decision_function(embeddings)
        s_min, s_max = float(np.min(scores)), float(np.max(scores))
        span = (s_max - s_min) or 1.0
        db2 = SessionLocal()
        for i, doc_id in enumerate(self.doc_ids):
            doc = db2.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.anomaly_score = float((s_max - scores[i]) / span)
        db2.commit()
        db2.close()

        return topics

    def get_3d_coordinates(self):
        """Return UMAP 3D coordinates for all loaded documents."""
        if self.topic_model is None:
            model_path = MODEL_DIR / "bertopic_model.pkl"
            if model_path.exists():
                with open(model_path, "rb") as f:
                    self.topic_model = pickle.load(f)
            else:
                return None
        if not self.texts:
            return None
        # Reuse cached embeddings when available, otherwise encode once.
        embeddings = self.compute_embeddings()
        coords = self.topic_model.umap_model.transform(embeddings)
        return coords  # shape (n_docs, 3)

def retrain_full_pipeline():
    modeler = TopicModeler()
    count = modeler.load_documents_from_db()
    if count < 5:
        return {"status": "error", "message": f"Only {count} documents. Need ≥5 for topic modeling."}
    modeler.fit()
    return {"status": "success", "documents": count}
