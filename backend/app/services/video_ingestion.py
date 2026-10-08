from __future__ import annotations

import os
import time
import cv2
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from loguru import logger

from backend.app.config import settings
from backend.app.core.async_utils import run_sync
from backend.app.db.mongo import videos as videos_col, detections as detections_col, events as events_col, cameras as cameras_col
from backend.app.services.evidence_service import generate_evidence_frame
from backend.app.services.sem_indexer import index_clip

# Global dictionary tracking active processing threads/jobs
_processing_jobs: Dict[str, Dict[str, Any]] = {}

# Default CCTV Video Directory
VIDEOS_DIR: Path = settings.STORAGE_ROOT / "videos"
VIDEOS_DIR.mkdir(parents=True, exist_ok=True)


def probe_video_file(file_path: str) -> Dict[str, Any]:
    """Inspect video file metadata using OpenCV."""
    abs_path = os.path.abspath(file_path)
    if not os.path.exists(abs_path):
        raise FileNotFoundError(f"Video file not found: {abs_path}")

    fps = 25.0
    frame_count = 0
    width = 640
    height = 480
    duration_seconds = 0.0

    try:
        cap = cv2.VideoCapture(abs_path)
        if cap and cap.isOpened():
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 640)
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 480)
            duration_seconds = frame_count / fps if fps > 0 else 0.0
            cap.release()
    except Exception as e:
        logger.warning("OpenCV probe fallback for {}: {}", abs_path, e)

    return {
        "file_path": abs_path,
        "filename": os.path.basename(abs_path),
        "fps": round(float(fps), 2),
        "frame_count": frame_count,
        "duration_seconds": round(float(duration_seconds), 2),
        "width": width,
        "height": height,
    }



def register_video(
    camera_id: str,
    camera_name: str,
    file_path: str,
    video_id: Optional[str] = None,
    start_time: Optional[str] = None,
) -> Dict[str, Any]:
    """Register a CCTV video segment in MongoDB video registry."""
    meta = probe_video_file(file_path)
    vid_id = video_id or f"vid_{camera_id}_{int(time.time())}"
    now_iso = datetime.now(timezone.utc).isoformat()

    doc = {
        "video_id": vid_id,
        "camera_id": str(camera_id),
        "camera_name": camera_name,
        "file_path": meta["file_path"],
        "filename": meta["filename"],
        "fps": meta["fps"],
        "frame_count": meta["frame_count"],
        "duration_seconds": meta["duration_seconds"],
        "width": meta["width"],
        "height": meta["height"],
        "start_time": start_time or "00:00:00",
        "processing_status": "registered",  # registered | processing | completed | failed | stopped
        "processing_progress": 0.0,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    videos_col.update_one({"video_id": vid_id}, {"$set": doc}, upsert=True)

    # Also register/update camera metadata in cameras collection
    try:
        cameras_col.update_one(
            {"camera_id": str(camera_id)},
            {
                "$set": {
                    "name": camera_name,
                    "location": camera_name,
                    "status": "active",
                    "updated_at": now_iso,
                },
                "$setOnInsert": {
                    "camera_id": str(camera_id),
                    "created_at": now_iso,
                },
            },
            upsert=True,
        )
    except Exception as e:
        logger.warning("Failed to update camera metadata: {}", e)

    return doc


def process_video_background(
    video_id: str,
    sampling_interval_sec: float = 1.0,
    force_reprocess: bool = False,
) -> None:
    """Background worker function for video frame extraction, YOLO11 detection, evidence generation, and CLIP embedding."""
    video_doc = videos_col.find_one({"video_id": video_id})
    if not video_doc:
        logger.error("Cannot process video: video_id {} not found in database", video_id)
        return

    if video_doc.get("processing_status") == "completed" and not force_reprocess:
        logger.info("Video {} already processed; skipping", video_id)
        return

    file_path = os.path.abspath(video_doc["file_path"])
    camera_id = video_doc["camera_id"]
    camera_name = video_doc.get("camera_name") or f"Camera {camera_id}"

    # Step 1: Verify physical file existence
    file_exists = os.path.exists(file_path)
    file_size = os.path.getsize(file_path) if file_exists else 0

    logger.info("==================================================")
    logger.info("SPECTRA VIDEO PIPELINE")
    logger.info("==================================================")
    logger.info("Video ID: {}", video_id)
    logger.info("Video Path: {}", file_path)
    logger.info("Video exists: {}", file_exists)
    logger.info("Video size: {} bytes", file_size)

    if not file_exists or file_size == 0:
        logger.error("PIPELINE ERROR: Video file missing or zero bytes: {}", file_path)
        videos_col.update_one(
            {"video_id": video_id},
            {"$set": {"processing_status": "failed", "error": f"Video file missing or 0 bytes: {file_path}", "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        return

    # Update status to processing
    videos_col.update_one(
        {"video_id": video_id},
        {"$set": {"processing_status": "processing", "processing_progress": 0.0, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )

    stop_flag = threading.Event()
    _processing_jobs[video_id] = {"stop_flag": stop_flag, "status": "processing"}

    # Step 2: Verify OpenCV probe
    cap = cv2.VideoCapture(file_path)
    is_opened = cap.isOpened()
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 25.0) if is_opened else 25.0
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0) if is_opened else 0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 640) if is_opened else 640
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 480) if is_opened else 480
    duration = round(frame_count / fps, 2) if (is_opened and fps > 0) else 0.0

    logger.info("VIDEO PROBE:")
    logger.info("  opened: {}", is_opened)
    logger.info("  fps: {}", fps)
    logger.info("  frames: {}", frame_count)
    logger.info("  resolution: {}x{}", width, height)
    logger.info("  duration: {}s", duration)

    if not is_opened:
        logger.error("PIPELINE ERROR: OpenCV failed to open video: {}", file_path)
        videos_col.update_one(
            {"video_id": video_id},
            {"$set": {"processing_status": "failed", "error": "OpenCV VideoCapture failed to open file", "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        _processing_jobs.pop(video_id, None)
        return

    # Step 3: Raw Frame Extraction Test
    ret, test_frame = cap.read()
    logger.info("FRAME EXTRACTION TEST: attempted=1, successful={}", 1 if ret and test_frame is not None else 0)
    if not ret or test_frame is None:
        logger.error("PIPELINE ERROR: OpenCV failed to read initial frame from video: {}", file_path)
        cap.release()
        videos_col.update_one(
            {"video_id": video_id},
            {"$set": {"processing_status": "failed", "error": "OpenCV failed to read initial frame", "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        _processing_jobs.pop(video_id, None)
        return

    # Reset video capture stream back to start
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

    # Step 4: Load YOLO11 model
    model_name = getattr(settings, "MODEL_PATH", "yolo11m.pt")
    if "yolo26" in str(model_name).lower() or not model_name:
        model_name = "yolo11m.pt"

    logger.info("YOLO Model target: {}", model_name)
    try:
        from ultralytics import YOLO
        model = YOLO(model_name)
        logger.info("YOLO Model loaded: TRUE ({})", model_name)
    except Exception as e:
        logger.error("PIPELINE ERROR: Failed to load YOLO model '{}': {}", model_name, e)
        cap.release()
        videos_col.update_one(
            {"video_id": video_id},
            {"$set": {"processing_status": "failed", "error": f"Failed to load YOLO model: {e}", "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        _processing_jobs.pop(video_id, None)
        return

    # Step 5: Single-Frame YOLO11 Inference Test
    try:
        single_test_res = model(test_frame, conf=0.25, verbose=False)
        test_boxes = single_test_res[0].boxes if single_test_res and getattr(single_test_res[0], "boxes", None) is not None else []
        logger.info("YOLO11 SINGLE FRAME TEST:")
        logger.info("  frame_shape: {}", test_frame.shape)
        logger.info("  test_detections: {}", len(test_boxes))
        for tb in test_boxes:
            c_conf = float(tb.conf.cpu().numpy()[0]) if hasattr(tb, "conf") else 0.0
            c_cls = int(tb.cls.cpu().numpy()[0]) if hasattr(tb, "cls") else 0
            c_name = single_test_res[0].names.get(c_cls, str(c_cls)) if hasattr(single_test_res[0], "names") else str(c_cls)
            c_box = tb.xyxy.cpu().numpy()[0].tolist() if hasattr(tb, "xyxy") else []
            logger.info("  -> Detection: class={} conf={:.4f} bbox={}", c_name, c_conf, [round(x, 1) for x in c_box])
    except Exception as e:
        logger.warning("Single-frame test inference emitted notice: {}", e)

    # Step 6: Full Video Inference & Processing Loop
    frame_step = max(1, int(fps * sampling_interval_sec))
    frame_index = 0
    frames_read = 0
    frames_processed = 0
    frames_with_detections = 0
    total_detections = 0
    class_counts: Dict[str, int] = {}

    total_video_frames = max(frame_count, 1)

    logger.info("Starting video inference loop (step={} frames)...", frame_step)

    try:
        while cap.isOpened():
            if stop_flag.is_set():
                logger.info("Processing stopped by user for video_id={}", video_id)
                videos_col.update_one(
                    {"video_id": video_id},
                    {"$set": {"processing_status": "stopped", "updated_at": datetime.now(timezone.utc).isoformat()}},
                )
                break

            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
            ret, frame = cap.read()
            if not ret or frame is None:
                break

            frames_read += 1
            timestamp_seconds = round(frame_index / fps, 2)
            mins = int(timestamp_seconds // 60)
            secs = int(timestamp_seconds % 60)
            timestamp_formatted = f"{mins:02d}:{secs:02d}"

            # Run YOLO11 inference
            results = model(frame, conf=0.25, verbose=False)

            detections_to_store = []
            for r in results:
                if getattr(r, "boxes", None) is None:
                    continue
                boxes = r.boxes
                for box in boxes:
                    conf = float(box.conf.cpu().numpy()[0]) if hasattr(box, "conf") else 0.0
                    if conf < 0.25:
                        continue
                    cls_id = int(box.cls.cpu().numpy()[0]) if hasattr(box, "cls") else 0
                    obj_class = str(r.names.get(cls_id, "object")).lower() if hasattr(r, "names") else "object"
                    xyxy = box.xyxy.cpu().numpy()[0].tolist() if hasattr(box, "xyxy") else []

                    det_id = f"det_{video_id}_{frame_index}_{len(detections_to_store)}"

                    det_record = {
                        "detection_id": det_id,
                        "video_id": video_id,
                        "camera_id": str(camera_id),
                        "camera_name": camera_name,
                        "frame_number": frame_index,
                        "timestamp_seconds": timestamp_seconds,
                        "timestamp_formatted": timestamp_formatted,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "object_class": obj_class,
                        "confidence": round(conf, 4),
                        "bbox": xyxy,
                        "objects": [
                            {
                                "object_name": obj_class,
                                "confidence": round(conf, 4),
                                "bbox": xyxy,
                            }
                        ],
                        "created_at": datetime.now(timezone.utc).isoformat(),
                    }
                    detections_to_store.append(det_record)
                    class_counts[obj_class] = class_counts.get(obj_class, 0) + 1

            if detections_to_store:
                frames_with_detections += 1
                total_detections += len(detections_to_store)

                # Generate evidence frames with bounding boxes drawn
                ev_records = generate_evidence_frame(
                    frame=frame,
                    video_id=video_id,
                    camera_id=str(camera_id),
                    timestamp_seconds=timestamp_seconds,
                    frame_number=frame_index,
                    detections_list=detections_to_store,
                )

                # Attach evidence paths to detection records
                ev_map = {r["detection_id"]: r for r in ev_records}
                for det in detections_to_store:
                    ev_rec = ev_map.get(det["detection_id"])
                    if ev_rec:
                        det["evidence_path"] = ev_rec.get("image_path")
                        det["crop_path"] = ev_rec.get("crop_path")

                    # Persist detection in MongoDB
                    try:
                        detections_col.update_one(
                            {"detection_id": det["detection_id"]},
                            {"$set": det},
                            upsert=True,
                        )
                    except Exception as ex:
                        logger.warning("Failed to insert detection record: {}", ex)

                # Record frame event
                event_record = {
                    "event_id": f"evt_{video_id}_{frame_index}",
                    "video_id": video_id,
                    "camera_id": str(camera_id),
                    "camera_name": camera_name,
                    "timestamp_seconds": timestamp_seconds,
                    "timestamp_formatted": timestamp_formatted,
                    "event_type": "object_detected",
                    "detection_count": len(detections_to_store),
                    "objects": [d["object_class"] for d in detections_to_store],
                    "start_ts": datetime.now(timezone.utc).isoformat(),
                }
                try:
                    events_col.update_one(
                        {"event_id": event_record["event_id"]},
                        {"$set": event_record},
                        upsert=True,
                    )
                except Exception:
                    pass

            frames_processed += 1
            progress = min(100.0, round((frame_index / total_video_frames) * 100.0, 1))

            if frames_processed % 5 == 0:
                videos_col.update_one(
                    {"video_id": video_id},
                    {
                        "$set": {
                            "processing_progress": progress,
                            "frames_processed": frames_processed,
                            "frames_with_detections": frames_with_detections,
                            "total_detections": total_detections,
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        }
                    },
                )

            frame_index += frame_step
            if frame_index >= total_video_frames:
                break

    except Exception as err:
        logger.exception("Error during video processing loop for {}: {}", video_id, err)
        videos_col.update_one(
            {"video_id": video_id},
            {"$set": {"processing_status": "failed", "error": str(err)}},
        )
    finally:
        cap.release()

    if not stop_flag.is_set():
        # Step 7: Index CLIP Embeddings for semantic vector search
        vlm_count = 0
        try:
            logger.info("Indexing CLIP embeddings for video_id={}", video_id)
            index_clip(
                camera_id=str(camera_id),
                clip_path=file_path,
                clip_url=f"/media/recordings/{os.path.basename(file_path)}",
                every_sec=sampling_interval_sec,
            )
            from backend.app.db.mongo import vlm_frames as vlm_col
            vlm_count = vlm_col.count_documents({"clip_path": file_path})
        except Exception as e:
            logger.warning("CLIP indexing during video ingestion finished with notice: {}", e)

        # Step 8: Mark video status completed / ready
        videos_col.update_one(
            {"video_id": video_id},
            {
                "$set": {
                    "processing_status": "completed",
                    "processing_progress": 100.0,
                    "frames_processed": frames_processed,
                    "frames_with_detections": frames_with_detections,
                    "total_detections": total_detections,
                    "detection_count": total_detections,
                    "class_counts": class_counts,
                    "yolo_model": model_name,
                    "vlm_embeddings_count": vlm_count,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

        # Step 9: Structured Summary Logs
        logger.info("==================================================")
        logger.info("SPECTRA VIDEO PIPELINE COMPLETE")
        logger.info("==================================================")
        logger.info("Video ID: {}", video_id)
        logger.info("Video Path: {}", file_path)
        logger.info("Frames read: {}", frames_read)
        logger.info("Frames processed: {}", frames_processed)
        logger.info("Frames with detections: {}", frames_with_detections)
        logger.info("Total detections: {}", total_detections)
        logger.info("Class counts: {}", class_counts)
        logger.info("VLM Embeddings: {}", vlm_count)
        logger.info("Status: COMPLETED (READY)")
        logger.info("==================================================")

    _processing_jobs.pop(video_id, None)


def start_processing_job(video_id: str, sampling_interval_sec: float = 1.0) -> bool:
    """Launch background video ingestion thread."""
    if video_id in _processing_jobs:
        return False

    thread = threading.Thread(
        target=process_video_background,
        args=(video_id, sampling_interval_sec),
        name=f"ingest-{video_id}",
        daemon=True,
    )
    thread.start()
    return True


def stop_processing_job(video_id: str) -> bool:
    """Signal background video ingestion job to stop."""
    job = _processing_jobs.get(video_id)
    if job and "stop_flag" in job:
        job["stop_flag"].set()
        return True
    return False
