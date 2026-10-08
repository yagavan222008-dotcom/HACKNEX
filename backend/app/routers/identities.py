from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from backend.app.core.async_utils import run_sync
from backend.app.services.reid_service import list_all_identities, reconstruct_journey

router = APIRouter()


@router.get("", response_model=List[Dict[str, Any]])
async def list_identities(limit: int = Query(50, ge=1, le=200)):
    """List tracked identities across multi-camera streams."""
    def _block():
        return list_all_identities(limit=limit)
    return await run_sync(_block)


@router.get("/{identity_id}/journey")
async def get_identity_journey(identity_id: str):
    """Retrieve chronologically ordered multi-camera journey reconstruction for specified identity."""
    def _block():
        journey = reconstruct_journey(identity_id)
        if not journey or journey.get("observation_count", 0) == 0:
            raise HTTPException(status_code=404, detail=f"No observations found for identity {identity_id}")
        return journey
    return await run_sync(_block)
