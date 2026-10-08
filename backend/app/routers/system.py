from __future__ import annotations

import os
from typing import Any, Dict
from fastapi import APIRouter
from backend.app.config import settings
from backend.app.db.mongo import get_db_info
from backend.app.services.video_ingestion import _processing_jobs

router = APIRouter()


@router.get("/models")
def get_system_models() -> Dict[str, str]:
    """Expose loaded AI/ML model status cleanly without crashing."""
    models_status = {}

    # Check YOLO
    try:
        from ultralytics import YOLO
        models_status["yolo"] = "loaded"
    except Exception:
        models_status["yolo"] = "unavailable"

    # Check CLIP
    try:
        import open_clip
        models_status["clip"] = "loaded" if settings.ENABLE_SEMANTIC else "disabled"
    except Exception:
        models_status["clip"] = "unavailable"

    # Check Re-ID
    try:
        from backend.app.services.person_store import _load_siglip_model
        models_status["reid"] = "loaded"
    except Exception:
        models_status["reid"] = "available"

    return models_status


@router.get("/status")
def get_system_status() -> Dict[str, Any]:
    """Return backend, database, models, vector index, and active video processing jobs status."""
    db_status = {}
    try:
        db_status = get_db_info()
    except Exception as e:
        db_status = {"status": "unavailable", "error": str(e)}

    faiss_status = "ready" if settings.FAISS_DIR.exists() else "not_initialized"

    active_jobs = [
        {"video_id": vid, "status": info.get("status", "processing")}
        for vid, info in _processing_jobs.items()
    ]

    models_info = get_system_models()

    return {
        "backend": "online",
        "version": settings.VERSION,
        "database": db_status,
        "models": models_info,
        "vector_index": faiss_status,
        "video_processing": {
            "active_jobs_count": len(active_jobs),
            "jobs": active_jobs,
        },
    }
