from __future__ import annotations

from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from loguru import logger

from backend.app.db.mongo import camera_topology as topology_col

# Default multi-camera CCTV topology configuration for EPS05
DEFAULT_TOPOLOGY = [
    {
        "source_camera": "CAM-01",
        "source_name": "Main Gate",
        "destination_camera": "CAM-02",
        "destination_name": "Parking",
        "min_travel_seconds": 5.0,
        "max_travel_seconds": 600.0,
    },
    {
        "source_camera": "CAM-02",
        "source_name": "Parking",
        "destination_camera": "CAM-03",
        "destination_name": "Lobby",
        "min_travel_seconds": 5.0,
        "max_travel_seconds": 600.0,
    },
    {
        "source_camera": "CAM-01",
        "source_name": "Main Gate",
        "destination_camera": "CAM-03",
        "destination_name": "Lobby",
        "min_travel_seconds": 10.0,
        "max_travel_seconds": 900.0,
    },
]


def init_default_topology() -> None:
    """Initialize camera topology records in MongoDB if not present."""
    try:
        for route in DEFAULT_TOPOLOGY:
            topology_col.update_one(
                {
                    "source_camera": route["source_camera"],
                    "destination_camera": route["destination_camera"],
                },
                {"$set": route},
                upsert=True,
            )
    except Exception as e:
        logger.warning("Failed to initialize camera topology: {}", e)


def get_topology_routes() -> List[Dict[str, Any]]:
    """Return all camera topology transition routes."""
    try:
        init_default_topology()
        return list(topology_col.find({}, {"_id": 0}))
    except Exception as e:
        logger.warning("Failed to fetch topology routes: {}", e)
        return DEFAULT_TOPOLOGY


def is_transition_plausible(
    source_cam: str,
    dest_cam: str,
    time_delta_seconds: float,
) -> Tuple[bool, str]:
    """
    Validate whether transition between source_cam and dest_cam in time_delta_seconds
    is physically plausible according to camera topology.
    """
    if str(source_cam).strip() == str(dest_cam).strip():
        return True, "Same camera observation"

    try:
        route = topology_col.find_one(
            {
                "$or": [
                    {"source_camera": str(source_cam), "destination_camera": str(dest_cam)},
                    {"source_camera": str(dest_cam), "destination_camera": str(source_cam)},
                ]
            },
            {"_id": 0},
        )
        if not route:
            # Default fallback for unconfigured routes
            if 0.0 <= time_delta_seconds <= 1800.0:
                return True, "Route unconstrained; time delta plausible"
            return False, f"Time delta {time_delta_seconds:.1f}s outside default window"

        min_t = float(route.get("min_travel_seconds", 0.0))
        max_t = float(route.get("max_travel_seconds", 1800.0))

        if time_delta_seconds < min_t:
            return False, f"Impossible transition: {time_delta_seconds:.1f}s is less than min travel time ({min_t}s)"
        if time_delta_seconds > max_t:
            return False, f"Expired transition: {time_delta_seconds:.1f}s exceeds max travel time ({max_t}s)"

        return True, "Transition matches topology bounds"
    except Exception as e:
        logger.warning("Error evaluating topology plausibility: {}", e)
        return True, "Topology validation fallback"
