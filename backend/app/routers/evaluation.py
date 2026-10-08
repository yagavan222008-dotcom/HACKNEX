from __future__ import annotations

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from backend.app.core.async_utils import run_sync
from backend.evaluation.evaluator import run_evaluation_benchmark
from backend.app.db.mongo import evaluation_results as eval_r_col

router = APIRouter()


class RunEvalRequest(BaseModel):
    mode: str = Field(default="PROPOSED", description="Retrieval evaluation mode: 'BASELINE' or 'PROPOSED'")


@router.post("/run", response_model=Dict[str, Any])
async def run_eval(req: RunEvalRequest):
    """Trigger held-out benchmark evaluation suite and record metrics."""
    def _block():
        return run_evaluation_benchmark(mode=req.mode.upper())
    return await run_sync(_block)


@router.get("/results", response_model=List[Dict[str, Any]])
async def get_eval_results(limit: int = Query(20, ge=1, le=100)):
    """Retrieve historical benchmark evaluation run results."""
    def _block():
        try:
            return list(eval_r_col.find({}, {"_id": 0}).sort("timestamp", -1).limit(limit))
        except Exception:
            return []
    return await run_sync(_block)
