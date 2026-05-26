"""Order-of-battle style analytics for UAP event streams."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

DOMAIN_PRESENCE = {"space", "atmospheric", "trans-medium", "sub-surface oceanic"}
KINEMATIC_TRAITS = {"loitering", "linear", "rapid", "swarm"}
ELECTRONIC_SIGNATURES = {"rf/em spike", "grid anomaly", "optical cloak"}


@dataclass
class EntityStateMatrix:
    domain_presence: str
    kinematic_trait: str
    electronic_signature: str
    historical_notes: list[str] = field(default_factory=list)


@dataclass
class CorrelativeBaselines:
    military_capability_match: bool
    radar_outpost_overlap: bool
    commercial_corridor_overlap: bool
    experimental_launch_overlap: bool


@dataclass
class AnomalousGapIdentifier:
    is_gap: bool
    reasons: list[str] = field(default_factory=list)


def analyse_event(event: dict[str, Any]) -> dict[str, Any]:
    domain = _pick_domain(event)
    kinematic = _pick_kinematic_trait(event)
    signature = _pick_electronic_signature(event)
    baselines = CorrelativeBaselines(
        military_capability_match=bool(event.get("military_capability_match")),
        radar_outpost_overlap=bool(event.get("radar_outpost_overlap")),
        commercial_corridor_overlap=bool(event.get("commercial_corridor_overlap")),
        experimental_launch_overlap=bool(event.get("experimental_launch_overlap")),
    )
    gap = _identify_gap(event, baselines)

    return {
        "entity_state_matrix": EntityStateMatrix(domain, kinematic, signature, event.get("historical_notes", [])).__dict__,
        "correlative_baselines": baselines.__dict__,
        "anomalous_gap_identifier": gap.__dict__,
    }


def _pick_domain(event: dict[str, Any]) -> str:
    domain = str(event.get("domain_presence", "atmospheric")).lower()
    return domain if domain in DOMAIN_PRESENCE else "atmospheric"


def _pick_kinematic_trait(event: dict[str, Any]) -> str:
    trait = str(event.get("kinematic_trait", "linear")).lower()
    return trait if trait in KINEMATIC_TRAITS else "linear"


def _pick_electronic_signature(event: dict[str, Any]) -> str:
    signature = str(event.get("electronic_signature", "rf/em spike")).lower()
    return signature if signature in ELECTRONIC_SIGNATURES else "rf/em spike"


def _identify_gap(event: dict[str, Any], baselines: CorrelativeBaselines) -> AnomalousGapIdentifier:
    reasons: list[str] = []
    if float(event.get("speed_mps", 0.0)) > 1_700 and not event.get("thermal_signature_present", False):
        reasons.append("Hypersonic-like motion without thermal signature")
    if event.get("domain_presence") == "trans-medium" and not baselines.military_capability_match:
        reasons.append("Trans-medium behaviour outside known baseline capability")
    if event.get("swarm_count", 0) >= 5 and not baselines.commercial_corridor_overlap:
        reasons.append("Coordinated swarm pattern outside civilian traffic corridors")
    return AnomalousGapIdentifier(is_gap=bool(reasons), reasons=reasons)
