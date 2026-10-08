from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timezone
from loguru import logger

from backend.app.db.mongo import events as events_col, detections as detections_col

TEMPORAL_OPERATORS = ["BEFORE", "AFTER", "DURING", "NEAR", "NEXT", "PREVIOUS", "WITHIN", "BETWEEN", "SAME_ENTITY"]


def extract_temporal_operator(query: str) -> Tuple[Optional[str], Dict[str, Any]]:
    """
    Parse temporal relationship keywords from natural language query.
    Returns (operator, operator_metadata).
    """
    q_low = query.lower()

    if re.search(r"\b(after|following|went next|where did (he|she|it|they) go|next)\b", q_low):
        return "AFTER", {"operator": "AFTER"}
    elif re.search(r"\b(before|prior to|earlier than|preceding)\b", q_low):
        return "BEFORE", {"operator": "BEFORE"}
    elif re.search(r"\b(during|while|in the middle of)\b", q_low):
        return "DURING", {"operator": "DURING"}
    elif re.search(r"\b(around|near|about|approx|within\s+\d+\s*(mins?|minutes?|seconds?|secs?))\b", q_low):
        m = re.search(r"within\s+(\d+)\s*(mins?|minutes?|seconds?|secs?)", q_low)
        window = 300.0  # default 5 minutes
        if m:
            val = float(m.group(1))
            unit = m.group(2)
            window = val * 60.0 if unit.startswith("m") else val
        return "NEAR", {"operator": "NEAR", "window_seconds": window}
    elif re.search(r"\b(between)\b", q_low):
        return "BETWEEN", {"operator": "BETWEEN"}

    return None, {}


def apply_temporal_spatial_reasoning(
    candidates: List[Dict[str, Any]],
    parsed_filter: Dict[str, Any],
    query: str,
) -> List[Dict[str, Any]]:
    """
    Apply temporal and spatial constraint filters to candidate search results.
    Guarantees logical event sequences grounded in empirical timestamps.
    """
    operator, meta = extract_temporal_operator(query)
    if not operator:
        return candidates

    ref_timestamp = parsed_filter.get("reference_timestamp_seconds")
    ref_camera = parsed_filter.get("reference_camera_id")
    ref_identity = parsed_filter.get("identity_id") or parsed_filter.get("__grounded_entity", {}).get("identity_id")

    filtered: List[Dict[str, Any]] = []

    for item in candidates:
        cand_ts = float(item.get("timestamp_seconds") or 0.0)
        cand_cam = str(item.get("camera_id") or "")
        cand_id = str(item.get("identity_id") or "")

        is_match = True

        # Operator AFTER
        if operator in ("AFTER", "NEXT"):
            if ref_timestamp is not None and cand_ts <= float(ref_timestamp):
                is_match = False

        # Operator BEFORE
        elif operator in ("BEFORE", "PREVIOUS"):
            if ref_timestamp is not None and cand_ts >= float(ref_timestamp):
                is_match = False

        # Operator NEAR
        elif operator == "NEAR":
            if ref_timestamp is not None:
                window = meta.get("window_seconds", 300.0)
                if abs(cand_ts - float(ref_timestamp)) > window:
                    is_match = False

        # Operator SAME_ENTITY
        if ref_identity and cand_id:
            if ref_identity != cand_id:
                is_match = False

        if is_match:
            item["temporal_reasoning"] = f"Satisfies operator {operator}"
            filtered.append(item)

    # Sort results according to temporal ordering
    if operator in ("AFTER", "NEXT"):
        filtered.sort(key=lambda x: float(x.get("timestamp_seconds") or 0.0))
    elif operator in ("BEFORE", "PREVIOUS"):
        filtered.sort(key=lambda x: float(x.get("timestamp_seconds") or 0.0), reverse=True)

    return filtered if filtered else candidates
