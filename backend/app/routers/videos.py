from __future__ import annotations

from typing import Any, Dict, List, Optional
import os
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Form, Request
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field
from pathlib import Path

import shutil

from backend.app.config import settings
from backend.app.core.async_utils import run_sync
from backend.app.services.frame_store import mjpeg_generator
from backend.app.services.sem_indexer import index_clip
from backend.app.db.mongo import vlm_frames, cameras as cameras_col

# Optional YOLO fallback for enriching objects in testing dashboard
try:
    import cv2  # type: ignore
except Exception:  # pragma: no cover
    cv2 = None  # type: ignore

try:
    from ultralytics import YOLO as _API_YOLO  # type: ignore
except Exception:  # pragma: no cover
    _API_YOLO = None  # type: ignore

router = APIRouter()


class MediaItem(BaseModel):
    path: str
    size_bytes: int
    modified_at: str  # ISO timestamp
    url: str  # static serving URL


def _walk_media(root_dir: str, base_url: str, prefix: Optional[str] = None, limit: int = 200) -> List[MediaItem]:
    result: List[MediaItem] = []
    root_dir = os.path.abspath(root_dir)
    if not os.path.isdir(root_dir):
        return []

    count = 0
    for dirpath, _, filenames in os.walk(root_dir):
        for fname in filenames:
            fpath = os.path.join(dirpath, fname)
            rel = os.path.relpath(fpath, root_dir).replace("\\", "/")
            if prefix and not rel.startswith(prefix):
                continue
            try:
                stat = os.stat(fpath)
                size = stat.st_size
                # Use UTC-aware ISO timestamps for consistency with fallback path
                mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
            except OSError:
                size = 0
                mtime = datetime.now(timezone.utc).isoformat()
            url = f"{base_url}/{rel}"
            result.append(MediaItem(path=rel, size_bytes=size, modified_at=mtime, url=url))
            count += 1
            if count >= limit:
                return result
    return result


@router.get("/recordings", response_model=List[MediaItem])
async def list_recordings(prefix: Optional[str] = Query(None, description="relative path prefix filter"), limit: int = Query(200, ge=1, le=1000)) -> List[MediaItem]:
    def _block():
        try:
            return _walk_media(str(settings.RECORDINGS_DIR), "/media/recordings", prefix=prefix, limit=limit)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to list recordings: {e}") from e
    return await run_sync(_block)


@router.get("/clips", response_model=List[MediaItem])
async def list_clips(prefix: Optional[str] = Query(None, description="relative path prefix filter"), limit: int = Query(200, ge=1, le=1000)) -> List[MediaItem]:
    def _block():
        try:
            return _walk_media(str(settings.CLIPS_DIR), "/media/clips", prefix=prefix, limit=limit)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to list clips: {e}") from e
    return await run_sync(_block)


@router.get("/snapshots", response_model=List[MediaItem])
async def list_snapshots(prefix: Optional[str] = Query(None, description="relative path prefix filter"), limit: int = Query(200, ge=1, le=1000)) -> List[MediaItem]:
    def _block():
        try:
            return _walk_media(str(settings.SNAPSHOTS_DIR), "/media/snapshots", prefix=prefix, limit=limit)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to list snapshots: {e}") from e
    return await run_sync(_block)


@router.get("/stream/{camera_id}")
def stream_mjpeg(
    camera_id: int,
    fps: float = Query(5.0, ge=0.2, le=30.0, description="Max frames per second to push"),
) -> StreamingResponse:
    """
    Serve an MJPEG multipart stream of the latest frames for the given camera.
    The detection loop updates an in-memory frame store; this endpoint streams it.
    """
    try:
        gen = mjpeg_generator(camera_id, fps=fps)
        return StreamingResponse(gen, media_type="multipart/x-mixed-replace; boundary=frame")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stream camera {camera_id}: {e}") from e


@router.get("/latest/{camera_id}")
async def latest_jpeg(camera_id: int) -> Response:
    """Return the latest available JPEG frame for the camera (fallback when MJPEG not supported)."""

    def _block():
        from backend.app.services.frame_store import get_latest
        item = get_latest(camera_id)
        if not item:
            return Response(status_code=204)
        jpg_bytes, _ = item
        return Response(
            content=jpg_bytes,
            media_type="image/jpeg",
            headers={"Cache-Control": "no-store, max-age=0", "Pragma": "no-cache", "Expires": "0"},
        )
    return await run_sync(_block)

@router.post("/upload")
async def upload_clip(
    file: UploadFile = File(...),
    camera_id: str = Form("1"),
    camera_name: Optional[str] = Form(None),
    video_name: Optional[str] = Form(None),
    start_time: Optional[str] = Form(None),
    every_sec: float = Form(1.0),
    with_captions: bool = Form(False),
) -> Dict[str, Any]:
    """
    Upload a CCTV video file (MP4, AVI, MOV, MKV), save to storage, register metadata in MongoDB,
    and kick off background YOLO11 detection + frame extraction + CLIP indexing pipeline.
    """
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="Missing filename")

        ext = Path(file.filename).suffix.lower()
        if ext not in [".mp4", ".avi", ".mov", ".mkv"]:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported video format '{ext}'. Please upload MP4, AVI, MOV, or MKV.",
            )

        # Ensure destination directory exists
        videos_dir: Path = settings.STORAGE_ROOT / "videos"
        videos_dir.mkdir(parents=True, exist_ok=True)

        # Sanitize filename
        clean_name = Path(file.filename).name.replace("..", "_").replace("/", "_").replace("\\", "_")
        timestamp_prefix = int(time.time())
        dest_filename = f"cctv_{timestamp_prefix}_{clean_name}"
        dest_path = videos_dir / dest_filename

        # Save uploaded file to disk
        with dest_path.open("wb") as out:
            shutil.copyfileobj(file.file, out)

        cam_name = camera_name or f"Camera #{camera_id}"
        vid_name = video_name or clean_name
        custom_vid_id = f"vid_{camera_id}_{timestamp_prefix}"

        # Register video in MongoDB video registry
        from backend.app.services.video_ingestion import register_video, start_processing_job
        video_doc = register_video(
            camera_id=str(camera_id),
            camera_name=cam_name,
            file_path=str(dest_path.resolve()),
            video_id=custom_vid_id,
            start_time=start_time or "00:00:00",
        )

        # Kick off background frame extraction, YOLO11 detection, and CLIP indexing
        started = start_processing_job(custom_vid_id, sampling_interval_sec=float(every_sec))

        return {
            "ok": True,
            "video_id": custom_vid_id,
            "camera_id": str(camera_id),
            "camera_name": cam_name,
            "video_name": vid_name,
            "file_path": str(dest_path.resolve()),
            "processing_status": "processing" if started else "registered",
            "message": "CCTV video uploaded and queued for YOLO11 detection & CLIP indexing",
            "video": video_doc,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CCTV Video Upload failed: {e}") from e

@router.get("/frames")
async def list_clip_frames(
    clip_path: str,
    limit: int = Query(500, ge=1, le=5000),
    enrich: Optional[str] = Query(None, description="optional enrichment: 'yolo' to compute objects on-the-fly"),
) -> List[Dict[str, Any]]:
    """Return frame-level metadata for a clip from the semantic index (vlm_frames)."""

    def _block():
        try:
            cur = vlm_frames.find(
            {"clip_path": clip_path},
            {
                "_id": 0,
                "camera_id": 1,
                "clip_path": 1,
                "clip_url": 1,
                "frame_ts": 1,
                "frame_index": 1,
                "model": 1,
                "caption": 1,
                "object_captions": 1,
                "hash": 1,
                "embedding_dim": 1,
            },
            ).sort("frame_index", 1).limit(int(limit))
            docs = list(cur)

            # Best-effort enrichment: if object_captions are missing, compose from detections near frame_ts
            try:
                from backend.app.db.mongo import detections as _detections  # local import
            except Exception:
                _detections = None  # type: ignore

            if _detections is not None:
                try:
                    from backend.app.services.attribute_encoder import get_attribute_encoder
                    _encoder = get_attribute_encoder()
                except Exception:
                    _encoder = None
                if _encoder is not None:
                    # Collect frames needing enrichment
                    pending = []
                    for d in docs:
                        if d.get("object_captions"):
                            continue
                        ts = d.get("frame_ts")
                        cam = d.get("camera_id")
                        if ts and cam is not None:
                            try:
                                dt = datetime.fromisoformat(str(ts))
                                pending.append((d, int(cam), dt))
                            except Exception:
                                continue

                    # Build batched query per frame window
                    if pending:
                        window = timedelta(seconds=3)
                        or_clauses = []
                        for _, cam, dt in pending:
                            or_clauses.append(
                                {
                                    "camera_id": cam,
                                    "timestamp": {
                                        "$gte": (dt - window).isoformat(),
                                        "$lte": (dt + window).isoformat(),
                                    },
                                }
                            )

                        det_docs: List[Dict[str, Any]] = []
                        try:
                            det_docs = list(
                                _detections.find({"$or": or_clauses}, {"_id": 0, "objects": 1, "camera_id": 1, "timestamp": 1})
                                .limit(10 * len(pending))
                            )
                        except Exception:
                            det_docs = []

                        # Index detections by camera for quick filtering
                        det_by_cam: Dict[int, List[Dict[str, Any]]] = {}
                        for di in det_docs:
                            try:
                                cam = int(di.get("camera_id"))
                            except Exception:
                                continue
                            det_by_cam.setdefault(cam, []).append(di)

                        for doc_ref, cam, frame_dt in pending:
                            candidates = []
                            for di in det_by_cam.get(cam, []):
                                try:
                                    ts = datetime.fromisoformat(str(di.get("timestamp")))
                                except Exception:
                                    continue
                                if abs((ts - frame_dt).total_seconds()) <= 3:
                                    candidates.append(di)
                            if not candidates:
                                continue

                            out: List[str] = []
                            for di in candidates:
                                for o in (di.get("objects") or []):
                                    caption = _encoder.object_to_caption(o)
                                    if caption:
                                        out.append(caption)
                                    if len(out) >= 20:
                                        break
                                if len(out) >= 20:
                                    break
                            if out:
                                doc_ref["object_captions"] = out

            # Optional YOLO enrichment if requested and object_captions still missing
            if enrich == "yolo" and cv2 is not None and _API_YOLO is not None:
                try:
                    model = _API_YOLO(settings.MODEL_PATH)
                except Exception:
                    model = None
                if model is not None:
                    try:
                        cap = cv2.VideoCapture(clip_path)
                        if cap and cap.isOpened():
                            for d in docs:
                                if d.get("object_captions"):
                                    continue
                                idx = d.get("frame_index")
                                if idx is None:
                                    continue
                                try:
                                    cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
                                    ok, frame = cap.read()
                                    if not ok or frame is None:
                                        continue
                                    names: List[str] = []
                                    res = model(frame)
                                    for r in res:
                                        if getattr(r, "boxes", None) is None:
                                            continue
                                        cls = r.boxes.cls.cpu().numpy() if hasattr(r.boxes, "cls") else []
                                        for c in cls:
                                            try:
                                                nm = str(r.names[int(c)]) if hasattr(r, "names") else None
                                            except Exception:
                                                nm = None
                                            if nm:
                                                names.append(str(nm).lower())
                                            if len(names) >= 20:
                                                break
                                        if len(names) >= 20:
                                            break
                                    if names:
                                        d["object_captions"] = names
                                except Exception:
                                    continue
                        if cap:
                            try:
                                cap.release()
                            except Exception:
                                pass
                    except Exception:
                        pass

            return docs
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"failed to fetch frames: {e}") from e
    return await run_sync(_block)


# ── EPS05 Recorded CCTV Video Registry & Ingestion Endpoints ───────────────

class VideoRegisterRequest(BaseModel):
    camera_id: str = Field(..., description="Camera identifier, e.g. CAM-01")
    camera_name: str = Field(..., description="Camera descriptive name, e.g. Main Gate")
    file_path: str = Field(..., description="Absolute or relative file path to MP4 video")
    video_id: Optional[str] = Field(default=None, description="Optional custom video ID")
    start_time: Optional[str] = Field(default=None, description="Optional CCTV recording start timestamp")


class ProcessVideoRequest(BaseModel):
    sampling_interval_sec: float = Field(default=1.0, ge=0.1, le=10.0, description="Frame sampling interval in seconds")
    force_reprocess: bool = Field(default=False, description="Whether to reprocess completed videos")


@router.post("/register")
async def register_video_endpoint(req: VideoRegisterRequest) -> Dict[str, Any]:
    """Register a CCTV video segment metadata into MongoDB video registry."""
    def _block():
        from backend.app.services.video_ingestion import register_video
        try:
            return register_video(
                camera_id=req.camera_id,
                camera_name=req.camera_name,
                file_path=req.file_path,
                video_id=req.video_id,
                start_time=req.start_time,
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Video registration failed: {e}") from e
    return await run_sync(_block)


@router.get("")
async def list_videos(camera_id: Optional[str] = Query(None), limit: int = Query(50, ge=1, le=200)) -> List[Dict[str, Any]]:
    """List registered CCTV videos."""
    def _block():
        from backend.app.db.mongo import videos as videos_col
        query = {}
        if camera_id:
            query["camera_id"] = str(camera_id)
        docs = list(videos_col.find(query, {"_id": 0}).sort("created_at", -1).limit(limit))
        for doc in docs:
            vid_id = doc.get("video_id")
            if vid_id and not doc.get("stream_url"):
                doc["stream_url"] = f"/api/videos/{vid_id}/stream"
        return docs
    return await run_sync(_block)


@router.get("/{video_id}")
async def get_video(video_id: str) -> Dict[str, Any]:
    """Get metadata for specific registered video."""
    def _block():
        from backend.app.db.mongo import videos as videos_col
        doc = videos_col.find_one({"video_id": video_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail=f"Video {video_id} not found")
        if not doc.get("stream_url"):
            doc["stream_url"] = f"/api/videos/{video_id}/stream"
        return doc
    return await run_sync(_block)


@router.get("/{video_id}/stream")
async def stream_video(video_id: str, request: Request):
    """
    Stream MP4 video with HTTP Range request support (206 Partial Content) for browser playback and timestamp seeking.
    """
    def _get_file():
        from backend.app.db.mongo import videos as videos_col
        doc = videos_col.find_one({"video_id": video_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail=f"Video {video_id} not found")
        fpath = os.path.abspath(doc.get("file_path", ""))
        if not os.path.exists(fpath):
            raise HTTPException(status_code=404, detail=f"Video file not found at {fpath}")
        return fpath

    fpath = await run_sync(_get_file)
    file_size = os.path.getsize(fpath)
    range_header = request.headers.get("range")

    if range_header:
        try:
            h_range = range_header.strip().lower()
            if not h_range.startswith("bytes="):
                raise ValueError("Invalid range unit")
            bytes_range = h_range.replace("bytes=", "")
            start_str, end_str = bytes_range.split("-")
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else file_size - 1
        except Exception:
            start = 0
            end = file_size - 1

        if start >= file_size or start > end:
            return Response(
                status_code=416,
                headers={"Content-Range": f"bytes */{file_size}", "Accept-Ranges": "bytes"},
            )

        end = min(end, file_size - 1)
        content_length = end - start + 1

        def chunk_generator(s: int, e: int, chunk_size: int = 1024 * 512):
            with open(fpath, "rb") as f:
                f.seek(s)
                remaining = e - s + 1
                while remaining > 0:
                    read_len = min(chunk_size, remaining)
                    data = f.read(read_len)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        return StreamingResponse(
            chunk_generator(start, end),
            status_code=206,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
                "Content-Type": "video/mp4",
            },
        )
    else:
        def full_generator(chunk_size: int = 1024 * 512):
            with open(fpath, "rb") as f:
                while True:
                    data = f.read(chunk_size)
                    if not data:
                        break
                    yield data

        return StreamingResponse(
            full_generator(),
            status_code=200,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(file_size),
                "Content-Type": "video/mp4",
            },
        )


@router.get("/{video_id}/status")
async def get_video_status(video_id: str) -> Dict[str, Any]:
    """Get video processing status and progress."""
    def _block():
        from backend.app.db.mongo import videos as videos_col
        doc = videos_col.find_one({"video_id": video_id}, {"_id": 0, "video_id": 1, "processing_status": 1, "processing_progress": 1, "error": 1})
        if not doc:
            raise HTTPException(status_code=404, detail=f"Video {video_id} not found")
        return doc
    return await run_sync(_block)


@router.post("/{video_id}/process")
async def process_video_endpoint(video_id: str, req: ProcessVideoRequest = ProcessVideoRequest()) -> Dict[str, Any]:
    """Trigger background frame extraction, YOLO detection, evidence generation, and CLIP vector indexing."""
    def _block():
        from backend.app.services.video_ingestion import start_processing_job
        started = start_processing_job(video_id, sampling_interval_sec=req.sampling_interval_sec)
        if not started:
            return {"ok": True, "video_id": video_id, "status": "already_running"}
        return {"ok": True, "video_id": video_id, "status": "processing_started"}
    return await run_sync(_block)


@router.post("/{video_id}/stop")
async def stop_video_endpoint(video_id: str) -> Dict[str, Any]:
    """Stop active video ingestion job."""
    def _block():
        from backend.app.services.video_ingestion import stop_processing_job
        stopped = stop_processing_job(video_id)
        return {"ok": stopped, "video_id": video_id}
    return await run_sync(_block)


@router.get("/{video_id}/pipeline-status")
async def get_pipeline_status(video_id: str) -> Dict[str, Any]:
    """Return comprehensive diagnostic pipeline status for a video."""
    def _block():
        from backend.app.db.mongo import videos as videos_col, detections as detections_col, vlm_frames as vlm_frames_col
        doc = videos_col.find_one({"video_id": video_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail=f"Video {video_id} not found")

        det_count = detections_col.count_documents({"video_id": video_id})
        vlm_count = vlm_frames_col.count_documents({"clip_path": doc.get("file_path")})

        status = doc.get("processing_status", "unknown")
        if status in ["completed", "ready"]:
            status = "ready"

        return {
            "video_id": video_id,
            "status": status,
            "stage": doc.get("failed_stage") or ("complete" if status == "ready" else "processing"),
            "frames_extracted": doc.get("frame_count") or doc.get("frames_count") or 0,
            "detections": det_count or doc.get("detection_count") or 0,
            "embeddings": vlm_count or doc.get("frames_count") or 0,
            "indexed": bool(status == "ready" or vlm_count > 0),
            "error": doc.get("error") or doc.get("error_message"),
        }
    return await run_sync(_block)


@router.delete("/{video_id}")
async def delete_video_endpoint(video_id: str) -> Dict[str, Any]:
    """Delete video registration record from database."""
    def _block():
        from backend.app.db.mongo import videos as videos_col
        res = videos_col.delete_one({"video_id": video_id})
        if res.deleted_count == 0:
            raise HTTPException(status_code=404, detail=f"Video {video_id} not found")
        return {"ok": True, "video_id": video_id, "deleted": True}
    return await run_sync(_block)


@router.get("/{video_id}/seek")
async def seek_video_timestamp(video_id: str, timestamp: float = Query(..., ge=0.0, description="Video position in seconds")) -> Dict[str, Any]:
    """Return video URL and exact video timestamp offset for seeking in video player."""
    def _block():
        from backend.app.db.mongo import videos as videos_col
        doc = videos_col.find_one({"video_id": video_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail=f"Video {video_id} not found")
        
        rel_path = doc.get("file_path", "")
        filename = os.path.basename(rel_path)
        video_url = f"/media/recordings/{filename}"
        
        mins = int(timestamp // 60)
        secs = int(timestamp % 60)
        formatted = f"{mins:02d}:{secs:02d}"

        return {
            "video_id": video_id,
            "camera_id": doc.get("camera_id"),
            "camera_name": doc.get("camera_name"),
            "timestamp_seconds": timestamp,
            "timestamp_formatted": formatted,
            "video_url": video_url,
            "duration_seconds": doc.get("duration_seconds", 0.0),
        }
    return await run_sync(_block)


@router.get("/{video_id}/debug")
async def debug_video_endpoint(video_id: str) -> Dict[str, Any]:
    """Diagnostic endpoint returning complete pipeline state, physical file stats, OpenCV probe, YOLO model details, and DB detection counts."""
    def _block():
        from backend.app.db.mongo import videos as videos_col, detections as detections_col, vlm_frames as vlm_frames_col
        doc = videos_col.find_one({"video_id": video_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail=f"Video {video_id} not found")

        file_path = os.path.abspath(doc.get("file_path", ""))
        file_exists = os.path.exists(file_path)
        file_size = os.path.getsize(file_path) if file_exists else 0

        video_opened = False
        if cv2 is not None and file_exists:
            try:
                cap = cv2.VideoCapture(file_path)
                video_opened = cap.isOpened()
                if cap:
                    cap.release()
            except Exception:
                video_opened = False

        det_count = detections_col.count_documents({"video_id": video_id})
        vlm_count = vlm_frames_col.count_documents({"clip_path": file_path})
        
        status = doc.get("processing_status", "registered")

        return {
            "video_id": video_id,
            "file_path": file_path,
            "file_exists": file_exists,
            "file_size": file_size,
            "video_opened": video_opened,
            "fps": doc.get("fps", 0.0),
            "frame_count": doc.get("frame_count", 0),
            "frames_processed": doc.get("frames_processed", 0),
            "frames_with_detections": doc.get("frames_with_detections", 0),
            "detections": det_count or doc.get("total_detections", 0),
            "class_counts": doc.get("class_counts", {}),
            "yolo_model": doc.get("yolo_model") or getattr(settings, "MODEL_PATH", "yolo11m.pt"),
            "yolo_loaded": True,
            "clip_enabled": getattr(settings, "ENABLE_SEMANTIC", True),
            "vlm_embeddings_count": vlm_count,
            "indexed": bool(status in ["completed", "ready"] or vlm_count > 0),
            "status": "ready" if status == "completed" else status,
            "error": doc.get("error") or None,
        }
    return await run_sync(_block)


