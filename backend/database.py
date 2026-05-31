from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Text, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from backend.config import DB_PATH

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True)
    filename = Column(String, nullable=False)
    original_path = Column(String, unique=True)
    extracted_text = Column(Text, default="")
    text_preview = Column(String(500), default="")
    file_type = Column(String(20))
    ingestion_date = Column(DateTime, default=datetime.utcnow)
    source_dataset = Column(String(100), default="unknown")  # for correlations
    has_ocr = Column(Boolean, default=False)
    # Optional metadata
    doc_date = Column(DateTime, nullable=True)   # extracted from file or content
    topic_id = Column(Integer, default=-1)       # -1 = outlier/anomaly
    anomaly_score = Column(Float, default=0.0)

    __table_args__ = (
        Index('ix_doc_lat_lon', 'latitude', 'longitude'),
        Index('ix_doc_year_month', 'year_month'),
    )
    
    # Inside Document class, add after existing columns:
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    incident_shape = Column(String(50), nullable=True)
    comment_length = Column(Integer, nullable=True)
    country = Column(String(10), nullable=True)
    state_code = Column(String(10), nullable=True)
    verified = Column(Boolean, default=False)
    year_month = Column(String(7), nullable=True)   # e.g., "2000-01"

class TopicWord(Base):
    __tablename__ = "topic_words"
    id = Column(Integer, primary_key=True)
    topic_id = Column(Integer, index=True)
    word = Column(String)
    score = Column(Float)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
