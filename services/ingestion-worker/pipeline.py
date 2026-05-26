"""File-type-agnostic ingestion pipeline for the Global UAP Intelligence Hub."""

from __future__ import annotations

import hashlib
import json
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def route_and_process(file_path: str, event_id: str) -> dict[str, Any]:
    """Route a file to the appropriate processor based on MIME type."""
    mime_type = _detect_mime(file_path)

    if mime_type.startswith("video/"):
        payload = process_video(file_path, event_id)
    elif mime_type in {"text/csv", "application/json"}:
        payload = process_tabular(file_path, event_id)
    elif mime_type == "application/pdf" or mime_type.startswith("text/"):
        payload = process_document(file_path, event_id)
    else:
        payload = process_binary_fallback(file_path, event_id)

    return {
        "event_id": event_id,
        "mime_type": mime_type,
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "payload": payload,
    }


def _detect_mime(file_path: str) -> str:
    import magic

    return magic.Magic(mime=True).from_file(file_path)


def process_video(file_path: str, event_id: str) -> dict[str, Any]:
    """Extract keyframes using background subtraction and luminance spikes."""
    import cv2
    import numpy as np

    output_dir = Path(tempfile.gettempdir()) / "uap-ingestion" / event_id / "keyframes"
    output_dir.mkdir(parents=True, exist_ok=True)

    capture = cv2.VideoCapture(file_path)
    subtractor = cv2.createBackgroundSubtractorMOG2(history=500, detectShadows=True)
    keyframes: list[str] = []
    luminance_spikes: list[dict[str, float]] = []
    frame_index = 0
    previous_luminance = None

    while capture.isOpened():
        success, frame = capture.read()
        if not success:
            break

        mask = subtractor.apply(frame)
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        mean_luminance = float(np.mean(gray))
        foreground_ratio = float(np.count_nonzero(mask)) / float(mask.size)

        luminance_delta = 0.0 if previous_luminance is None else abs(mean_luminance - previous_luminance)
        previous_luminance = mean_luminance

        if foreground_ratio > 0.08 or luminance_delta > 25.0:
            frame_path = output_dir / f"frame_{frame_index:06d}.jpg"
            cv2.imwrite(str(frame_path), frame)
            keyframes.append(str(frame_path))
            luminance_spikes.append(
                {
                    "frame_index": float(frame_index),
                    "mean_luminance": mean_luminance,
                    "luminance_delta": luminance_delta,
                    "foreground_ratio": foreground_ratio,
                }
            )

        frame_index += 1

    capture.release()

    return {
        "processor": "video",
        "keyframes": keyframes,
        "luminance_spikes": luminance_spikes,
        "frame_count": frame_index,
    }


def process_document(file_path: str, event_id: str) -> dict[str, Any]:
    """Extract document text and produce a sentence-transformer embedding."""
    from sentence_transformers import SentenceTransformer
    from unstructured.partition.auto import partition

    elements = partition(filename=file_path)
    text = "\n".join(element.text for element in elements if getattr(element, "text", "")).strip()
    model = SentenceTransformer("all-mpnet-base-v2")
    vector = model.encode(text or event_id, normalize_embeddings=True)

    return {
        "processor": "document",
        "text": text,
        "vector": vector.tolist(),
        "vector_dimensions": len(vector),
    }


def process_tabular(file_path: str, event_id: str) -> dict[str, Any]:
    """Normalize CSV or JSON content against the core UapEvent fields."""
    import pandas as pd

    path = Path(file_path)
    if path.suffix.lower() == ".json":
        frame = pd.read_json(path)
    else:
        frame = pd.read_csv(path)

    normalized_columns = {
        "timestamp": ["timestamp", "observed_at", "event_time", "datetime"],
        "latitude": ["latitude", "lat", "geo_lat"],
        "longitude": ["longitude", "lon", "lng", "geo_lon"],
        "altitude_meters": ["altitude_meters", "alt_m", "altitude", "height_m"],
    }

    normalized = {}
    for target, aliases in normalized_columns.items():
        for alias in aliases:
            if alias in frame.columns:
                normalized[target] = frame[alias]
                break
        else:
            normalized[target] = None

    normalized_frame = pd.DataFrame(normalized)
    normalized_frame.insert(0, "event_id", event_id)

    return {
        "processor": "tabular",
        "records": json.loads(normalized_frame.fillna("").to_json(orient="records")),
        "record_count": int(normalized_frame.shape[0]),
    }


def process_binary_fallback(file_path: str, event_id: str) -> dict[str, Any]:
    """Hash unsupported files and capture coarse metadata for later triage."""
    path = Path(file_path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    stat = path.stat()

    return {
        "processor": "binary_fallback",
        "event_id": event_id,
        "sha256": digest,
        "size_bytes": stat.st_size,
        "filename": path.name,
        "suffix": path.suffix,
    }
