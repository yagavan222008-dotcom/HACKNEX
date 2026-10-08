from __future__ import annotations

import time
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.app.core.async_utils import run_sync
from backend.app.services.nl_parser import parse_nl_with_llm, parse_simple_nl_to_filter
from backend.app.services.unified_retrieval import UnifiedRetrieval
from backend.app.services.memory_service import resolve_entity_references, store_memory_turn
from backend.app.services.reasoning_engine import apply_temporal_spatial_reasoning
from backend.app.services.evidence_service import verify_evidence

router = APIRouter()


class SearchQueryRequest(BaseModel):
    conversation_id: str = Field(default="default_session", description="Unique conversation session ID for memory context")
    query: str = Field(..., description="Natural language video query")
    limit: int = Field(default=10, ge=1, le=50)
    video_id: Optional[str] = Field(default=None, description="Optional active video ID scope")
    camera_id: Optional[str] = Field(default=None, description="Optional active camera ID scope")


import os
from loguru import logger

class SearchResultItem(BaseModel):
    result_id: str
    camera_id: str
    camera_name: str
    video_id: str
    detection_id: Optional[str] = None
    evidence_id: Optional[str] = None
    object_class: str
    confidence: float
    detection_confidence: Optional[float] = None
    clip_similarity: Optional[float] = None
    retrieval_score: float
    timestamp_seconds: float
    timestamp: str
    frame_number: int = 0
    evidence_url: Optional[str] = None
    crop_url: Optional[str] = None
    video_url: Optional[str] = None
    stream_url: Optional[str] = None
    video_offset: float
    identity_id: Optional[str] = None
    explanation: str


class SearchQueryResponse(BaseModel):
    conversation_id: str
    interpreted_query: Dict[str, Any]
    clarification_required: bool
    clarification_question: Optional[str] = None
    results: List[SearchResultItem]
    answer: str
    latency_ms: float
    evidence: List[Dict[str, Any]]


@router.post("/query", response_model=SearchQueryResponse)
async def search_query(req: SearchQueryRequest) -> SearchQueryResponse:
    """
    Unified EPS05 search endpoint supporting natural language parsing, hybrid retrieval,
    evidence verification, temporal reasoning, and clarification memory.
    """
    def _block():
        t_start = time.perf_counter()

        # Step 1: Parse natural language query
        try:
            parsed = parse_nl_with_llm(req.query)
        except Exception:
            parsed = parse_simple_nl_to_filter(req.query)

        # Bind active video / camera scope from request if provided
        if req.video_id:
            parsed["video_id"] = req.video_id
        if req.camera_id:
            parsed["camera_id"] = req.camera_id

        # Auto-bind video scope if only a single registered video exists in DB
        from backend.app.db.mongo import videos as videos_col
        if not parsed.get("video_id") and not parsed.get("camera_id"):
            try:
                v_docs = list(videos_col.find({}, {"video_id": 1, "camera_id": 1, "camera_name": 1}).limit(2))
                if len(v_docs) == 1:
                    parsed["video_id"] = v_docs[0].get("video_id")
                    parsed["camera_id"] = str(v_docs[0].get("camera_id"))
                    if v_docs[0].get("camera_name"):
                        parsed["camera_name"] = v_docs[0].get("camera_name")
            except Exception:
                pass

        # Step 2: Resolve entity references and clarification memory
        parsed, clarification_req, clarification_q = resolve_entity_references(
            req.conversation_id, req.query, parsed
        )

        if clarification_req and clarification_q:
            t_end = time.perf_counter()
            lat = round((t_end - t_start) * 1000.0, 2)
            store_memory_turn(
                conversation_id=req.conversation_id,
                query=req.query,
                clarification_question=clarification_q,
            )
            return SearchQueryResponse(
                conversation_id=req.conversation_id,
                interpreted_query=parsed,
                clarification_required=True,
                clarification_question=clarification_q,
                results=[],
                answer=clarification_q,
                latency_ms=lat,
                evidence=[],
            )

        # Step 3: Execute unified hybrid retrieval
        retrieval = UnifiedRetrieval()
        raw_res = retrieval.search(
            parsed_filter=parsed,
            semantic_query=req.query,
            limit=req.limit,
        )

        raw_candidates = raw_res.get("results") or []

        # Step 4: Temporal & Spatial reasoning filter
        reasoned_candidates = apply_temporal_spatial_reasoning(
            raw_candidates, parsed, req.query
        )

        # Step 5: Evidence verification & Result Schema conversion
        final_items: List[SearchResultItem] = []
        evidence_list: List[Dict[str, Any]] = []

        from backend.app.db.mongo import videos as videos_col, detections as detections_col

        for i, cand in enumerate(reasoned_candidates):
            # Resolve actual video record if video_id is missing or default
            vid_id = cand.get("video_id")
            clip_path = cand.get("file_path") or cand.get("clip_path")
            
            if (not vid_id or vid_id.startswith("vid_") and len(vid_id) <= 6) and clip_path:
                v_doc = videos_col.find_one({"file_path": os.path.abspath(clip_path)}) or videos_col.find_one({})
                if v_doc:
                    vid_id = v_doc.get("video_id")
            if not vid_id:
                v_doc = videos_col.find_one({"processing_status": "completed"}) or videos_col.find_one({})
                if v_doc:
                    vid_id = v_doc.get("video_id")

            # Resolve camera name & ID
            cam_id = str(cand.get("camera_id") or "1")
            cam_name = str(cand.get("camera_name") or cand.get("location") or "")
            if not cam_name or cam_name == f"Camera {cam_id}":
                c_doc = videos_col.find_one({"video_id": vid_id})
                if c_doc:
                    cam_name = c_doc.get("camera_name") or f"Camera {cam_id}"
                    cam_id = str(c_doc.get("camera_id") or cam_id)
            if not cam_name:
                cam_name = f"Camera {cam_id}"

            # Resolve detection document from DB if available
            det_id = cand.get("detection_id")
            ev_id = cand.get("evidence_id")
            ev_path = cand.get("evidence_path") or cand.get("crop_path") or cand.get("clip_url")

            det_doc = None
            if det_id:
                det_doc = detections_col.find_one({"detection_id": det_id})
            if not det_doc and vid_id:
                q_obj = parsed.get("objects.object_name") or cand.get("object_class") or cand.get("object_name")
                query_det: Dict[str, Any] = {"video_id": vid_id}
                if q_obj and str(q_obj).lower() not in {"detection", "unknown", "object"}:
                    query_det["objects.object_name"] = str(q_obj).lower()
                det_doc = detections_col.find_one(query_det) or detections_col.find_one({"video_id": vid_id})

            if det_doc:
                det_id = det_doc.get("detection_id") or det_id
                ev_id = f"ev_{det_id}" if det_id else ev_id
                ev_path = det_doc.get("evidence_path") or ev_path
                obj_cls = det_doc.get("object_class") or (det_doc.get("objects", [{}])[0].get("object_name") if det_doc.get("objects") else None)
                ts_sec = float(det_doc.get("timestamp_seconds") if det_doc.get("timestamp_seconds") is not None else 0.0)
                ts_fmt = det_doc.get("timestamp_formatted") or "00:00"
                frame_num = int(det_doc.get("frame_number") or 0)
                det_conf = float(det_doc.get("confidence") or (det_doc.get("objects", [{}])[0].get("confidence") if det_doc.get("objects") else 0.85))
            else:
                obj_cls = cand.get("object_class") or cand.get("object_name") or parsed.get("objects.object_name")
                ts_sec = float(cand.get("timestamp_seconds") if cand.get("timestamp_seconds") is not None else 0.0)
                mins = int(ts_sec // 60)
                secs = int(ts_sec % 60)
                ts_fmt = cand.get("timestamp_formatted") or f"{mins:02d}:{secs:02d}"
                frame_num = int(cand.get("frame_number") or 0)
                det_conf = float(cand.get("confidence") or cand.get("detection_confidence") or 0.85)

            # Never return generic "detection" unless literally stored as such
            if not obj_cls or str(obj_cls).lower() in {"detection", "unknown", "none", ""}:
                logger.warning("Discarding candidate with generic/missing object_class: {}", cand)
                continue

            # Verify evidence constraints
            cand_test = {
                **cand,
                "camera_id": cam_id,
                "object_class": obj_cls,
                "detection_confidence": det_conf,
            }
            is_valid, v_score, v_exp = verify_evidence(cand_test, parsed)
            if not is_valid:
                logger.info("Candidate failed evidence verification: {}", v_exp)
                continue

            # Format HTTP evidence URL
            ev_url = ev_path
            crop_url = cand.get("crop_path") or (det_doc.get("crop_path") if det_doc else None)

            if ev_url and not (str(ev_url).startswith("http://") or str(ev_url).startswith("https://") or str(ev_url).startswith("/api/")):
                if ev_id:
                    ev_url = f"/api/evidence/{ev_id}/image"
                else:
                    from urllib.parse import quote
                    ev_url = f"/api/evidence/image?path={quote(str(ev_url))}"

            stream_url = f"/api/videos/{vid_id}/stream"
            retrieval_score = round(float(cand.get("relevance_score") or cand.get("score") or v_score or 0.90), 2)
            clip_sim = round(float(cand.get("score_semantic") or cand.get("score_raw_semantic") or 0.85), 2) if cand.get("score_semantic") is not None else None

            item = SearchResultItem(
                result_id=f"res_{req.conversation_id}_{len(final_items)+1}",
                camera_id=cam_id,
                camera_name=cam_name,
                video_id=vid_id,
                detection_id=det_id,
                evidence_id=ev_id,
                object_class=str(obj_cls),
                confidence=retrieval_score,
                detection_confidence=round(det_conf, 2),
                clip_similarity=clip_sim,
                retrieval_score=retrieval_score,
                timestamp_seconds=ts_sec,
                timestamp=ts_fmt,
                frame_number=frame_num,
                evidence_url=ev_url,
                crop_url=crop_url,
                video_url=stream_url,
                stream_url=stream_url,
                video_offset=ts_sec,
                identity_id=cand.get("identity_id"),
                explanation=v_exp,
            )
            final_items.append(item)
            if ev_url:
                evidence_list.append({
                    "result_id": item.result_id,
                    "camera_id": item.camera_id,
                    "timestamp": item.timestamp,
                    "url": ev_url,
                })

        t_end = time.perf_counter()
        lat_ms = round((t_end - t_start) * 1000.0, 2)

        if final_items:
            logger.info("DEVELOPMENT TRACE - FIRST GROUND EVIDENCE RESULT: {}", final_items[0].model_dump())

        selected_entity = None
        if final_items:
            first_item = final_items[0]
            selected_entity = {
                "camera_id": first_item.camera_id,
                "video_id": first_item.video_id,
                "object_class": first_item.object_class,
                "timestamp_seconds": first_item.timestamp_seconds,
                "identity_id": first_item.identity_id,
            }

        store_memory_turn(
            conversation_id=req.conversation_id,
            query=req.query,
            selected_entity=selected_entity,
            camera_id=selected_entity.get("camera_id") if selected_entity else None,
            video_id=selected_entity.get("video_id") if selected_entity else None,
            identity_id=selected_entity.get("identity_id") if selected_entity else None,
        )

        return SearchQueryResponse(
            conversation_id=req.conversation_id,
            interpreted_query=parsed,
            clarification_required=False,
            clarification_question=None,
            results=final_items,
            answer=raw_res.get("answer", "Evidence retrieved successfully."),
            latency_ms=lat_ms,
            evidence=evidence_list,
        )

    return await run_sync(_block)
