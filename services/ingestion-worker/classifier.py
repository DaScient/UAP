"""Rule-based and ML-assisted classification helpers."""

from __future__ import annotations

import math
from typing import Any

SHAPE_ALIASES = {
    "tic tac": "TIC_TAC",
    "tictac": "TIC_TAC",
    "sphere": "SPHERE",
    "orb": "SPHERE",
    "disc": "DISC",
    "disk": "DISC",
    "triangle": "TRIANGLE",
    "triangular": "TRIANGLE",
}

ZERO_SHOT_LABELS = ["tic tac", "sphere", "disc", "triangle", "unknown"]


def classify_event(metadata_package: dict[str, Any], math_engine_output: dict[str, Any]) -> dict[str, Any]:
    """Generate a canonical classification payload."""
    event_id = metadata_package.get("event_id", "unknown-event")
    assigned_shape, confidence, reason = _infer_shape(metadata_package)
    speed_profile, mach_number = _infer_speed_profile(metadata_package, math_engine_output)
    anomalous_flag = bool(
        metadata_package.get("is_anomalous")
        or math_engine_output.get("near_space_transition")
        or (speed_profile == "Hypersonic" and not metadata_package.get("thermal_signature_present", False))
    )

    return {
        "event_id": event_id,
        "classification_metadata": {
            "assigned_shape": assigned_shape,
            "confidence_score": confidence,
            "anomalous_flag": anomalous_flag,
            "shape_reason": reason,
            "speed_profile": speed_profile,
            "mach_number": mach_number,
            "math_engine_context": math_engine_output,
        },
        "storage_routing_path": f"data/processed/{speed_profile}/{assigned_shape}/{event_id}/",
    }


def _infer_shape(metadata_package: dict[str, Any]) -> tuple[str, float, str]:
    candidates = [
        str(metadata_package.get("shape_hint", "")),
        str(metadata_package.get("observed_shape", "")),
        str(metadata_package.get("text", "")),
    ]

    for candidate in candidates:
        lowered = candidate.lower()
        for alias, normalized in SHAPE_ALIASES.items():
            if alias in lowered:
                return normalized, 0.92, f"rule match on token '{alias}'"

    if metadata_package.get("text"):
        from transformers import pipeline

        classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")
        result = classifier(metadata_package["text"], ZERO_SHOT_LABELS)
        label = result["labels"][0]
        score = float(result["scores"][0])
        normalized = SHAPE_ALIASES.get(label, "UNKNOWN")
        return normalized, score, f"zero-shot classification selected '{label}'"

    return "UNKNOWN", 0.1, "no rule-based or text evidence available"


def _infer_speed_profile(metadata_package: dict[str, Any], math_engine_output: dict[str, Any]) -> tuple[str, float]:
    speed_mps = float(
        metadata_package.get("speed_mps")
        or math_engine_output.get("speed_mps")
        or 0.0
    )
    altitude_m = float(
        metadata_package.get("altitude_meters")
        or math_engine_output.get("altitude_meters")
        or 0.0
    )
    medium_transition = bool(metadata_package.get("trans_medium") or math_engine_output.get("trans_medium"))

    if medium_transition:
        return "Trans-Medium", 0.0

    temperature_k = 288.15 - 0.0065 * min(altitude_m, 11_000.0)
    if altitude_m > 11_000.0:
        temperature_k = 216.65

    speed_of_sound = math.sqrt(1.4 * 287.05 * temperature_k)
    mach_number = speed_mps / speed_of_sound if speed_of_sound else 0.0

    if mach_number >= 5.0:
        return "Hypersonic", mach_number
    if mach_number >= 1.0:
        return "Supersonic", mach_number
    return "Subsonic", mach_number
