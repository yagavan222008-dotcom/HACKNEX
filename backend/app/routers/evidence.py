from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from backend.app.config import settings
from backend.app.db.mongo import evidence as evidence_col, detections as detections_col

router = APIRouter()

EVIDENCE_ROOT: Path = (settings.STORAGE_ROOT / "evidence").resolve()


def _safe_resolve_evidence_path(raw_path_or_id: str) -> Path:
    """
    Resolve an evidence ID, detection ID, or relative path to an absolute file Path on disk.
    Enforces security: target path MUST be within EVIDENCE_ROOT to prevent path traversal.
    """
    raw_str = str(raw_path_or_id).strip()
    if not raw_str:
        raise HTTPException(status_code=400, detail="Empty evidence key")

    # Direct absolute path check
    if os.path.isabs(raw_str) and os.path.exists(raw_str):
        p = Path(raw_str).resolve()
        if p.is_file():
            return p

    # DB lookup by ID if starting with ev_ or det_
    if raw_str.startswith("ev_") or raw_str.startswith("det_"):
        search_key = raw_str
        alt_key = raw_str[3:] if raw_str.startswith("ev_") else raw_str
        doc = evidence_col.find_one({"$or": [{"evidence_id": search_key}, {"detection_id": search_key}, {"detection_id": alt_key}]})
        if not doc:
            doc = detections_col.find_one({"$or": [{"detection_id": search_key}, {"detection_id": alt_key}, {"evidence_id": search_key}]})
        if doc:
            rel = doc.get("image_path") or doc.get("evidence_path") or doc.get("crop_path")
            if rel:
                raw_str = str(rel)

    if os.path.isabs(raw_str) and os.path.exists(raw_str):
        p = Path(raw_str).resolve()
        if p.is_file():
            return p

    # Sanitize path
    clean_path = raw_str.replace("\\", "/")
    if "/media/evidence/" in clean_path:
        clean_path = clean_path.split("/media/evidence/")[-1]
    elif "evidence/" in clean_path:
        clean_path = clean_path.split("evidence/")[-1]

    clean_path = clean_path.lstrip("/\\")
    target_path = (EVIDENCE_ROOT / clean_path).resolve()

    # Security check: target_path must be within EVIDENCE_ROOT or project root
    project_root = Path(__file__).resolve().parent.parent.parent
    try:
        target_path.relative_to(EVIDENCE_ROOT)
    except ValueError:
        try:
            target_path.relative_to(project_root)
        except ValueError:
            raise HTTPException(status_code=403, detail="Access denied: Invalid evidence path")

    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail=f"Evidence image file not found: {clean_path}")

    return target_path


@router.get("/{evidence_id}/image")
async def get_evidence_image_by_id(evidence_id: str) -> FileResponse:
    """Serve real evidence JPEG/PNG image by evidence_id or detection_id."""
    target_path = _safe_resolve_evidence_path(evidence_id)
    return FileResponse(str(target_path), media_type="image/jpeg")


@router.get("/image")
async def get_evidence_image_by_query(
    path: Optional[str] = Query(None),
    evidence_id: Optional[str] = Query(None),
) -> FileResponse:
    """Serve real evidence JPEG/PNG image by query parameters."""
    target_key = evidence_id or path
    if not target_key:
        raise HTTPException(status_code=400, detail="Missing path or evidence_id parameter")
    target_path = _safe_resolve_evidence_path(target_key)
    return FileResponse(str(target_path), media_type="image/jpeg")
