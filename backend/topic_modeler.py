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

    def load_documents_from_db(self):
        db = SessionLocal()
        docs = db.query(Document).filter(Document.extracted_text != "").all()
        self.documents = docs
        self.texts = [doc.extracted_text for doc in docs]
        self.doc_ids = [doc.id for doc in docs]
        db.close()
        return len(self.texts)

    def fit(self):
        if len(self.texts) < 5:
            raise ValueError("Need at least 5 documents for topic modeling")

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
        topics, probs = self.topic_model.fit_transform(self.texts)
        
        # Save model
        model_path = MODEL_DIR / "bertopic_model.pkl"
        with open(model_path, "wb") as f:
            pickle.dump(self.topic_model, f)
        
        # Update DB with topic assignments
        db = SessionLocal()
        for doc_id, topic, prob in zip(self.doc_ids, topics, probs):
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.topic_id = int(topic)
                # Anomaly score: probability of being outlier
                doc.anomaly_score = 1.0 - prob if topic == -1 else 0.0
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
        
        # Compute anomaly scores using Isolation Forest on embeddings
        embeddings = self.topic_model.embeddings_
        iso_forest = IsolationForest(contamination=0.1, random_state=42)
        anomaly_pred = iso_forest.fit_predict(embeddings)
        db2 = SessionLocal()
        for i, doc_id in enumerate(self.doc_ids):
            doc = db2.query(Document).filter(Document.id == doc_id).first()
            if doc:
                doc.anomaly_score = float(1 - anomaly_pred[i] / 2)  # scale -1/1 to 0-1
        db2.commit()
        db2.close()
        
        return topics

    def get_3d_coordinates(self):
        """Return UMAP 3D coordinates for all documents."""
        if self.topic_model is None:
            model_path = MODEL_DIR / "bertopic_model.pkl"
            if model_path.exists():
                with open(model_path, "rb") as f:
                    self.topic_model = pickle.load(f)
            else:
                return None
        # The reduced embeddings are stored in topic_model.umap_model.embeddings_
        # But we need to recompute for safety
        doc_embeddings = self.embedding_model.encode(self.texts, show_progress_bar=True)
        coords = self.topic_model.umap_model.transform(doc_embeddings)
        return coords  # shape (n_docs, 3)

def retrain_full_pipeline():
    modeler = TopicModeler()
    count = modeler.load_documents_from_db()
    if count < 5:
        return {"status": "error", "message": f"Only {count} documents. Need ≥5 for topic modeling."}
    modeler.fit()
    return {"status": "success", "documents": count}
