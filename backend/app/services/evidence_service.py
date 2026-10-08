from __future__ import annotations

import os
import cv2
import numpy as np
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timezone
from loguru import logger

from backend.app.config import settings
from backend.app.db.mongo import evidence as evidence_col, detections as detections_col

# Ensure evidence directory structure
EVIDENCE_DIR: Path = settings.STORAGE_ROOT / "evidence"
PRIVACY_DIR: Path = EVIDENCE_DIR / "privacy"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
PRIVACY_DIR.mkdir(parents=True, exist_ok=True)

# Face detector fallback for privacy blurring
_face_cascade = None

def _get_face_cascade():
    global _face_cascade
    if _face_cascade is None:
        try:
            cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
            _face_cascade = cv2.CascadeClassifier(cascade_path)
        except Exception as e:
            logger.warning("Failed to load OpenCV face cascade: {}", e)
    return _face_cascade


def generate_evidence_frame(
    frame: np.ndarray,
    video_id: str,
    camera_id: str,
    timestamp_seconds: float,
    frame_number: int,
    detections_list: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Save raw evidence frames, cropped object images, and create evidence records in MongoDB.
    
    Returns a list of created evidence dictionary records.
    """
    if frame is None or frame.size == 0:
        return []

    cam_dir = EVIDENCE_DIR / str(camera_id) / str(video_id)
    cam_dir.mkdir(parents=True, exist_ok=True)

    h, w = frame.shape[:2]
    created_records: List[Dict[str, Any]] = []

    # Draw frame with bboxes
    annotated_frame = frame.copy()

    for det in detections_list:
        bbox = det.get("bbox") or []
        obj_class = det.get("object_class") or det.get("object_name") or "object"
        conf = det.get("confidence") or det.get("conf") or 0.0
        det_id = det.get("detection_id") or f"det_{video_id}_{frame_number}_{len(created_records)}"

        if len(bbox) == 4:
            x1, y1, x2, y2 = [int(v) for v in bbox]
            # Ensure coordinates are within frame bounds
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)

            # Draw green box for detection
            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
            label = f"{obj_class} {conf:.2f}"
            cv2.putText(annotated_frame, label, (x1, max(15, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

            # Save object crop if valid bounding box
            crop_path = None
            if x2 > x1 and y2 > y1:
                crop_img = frame[y1:y2, x1:x2]
                if crop_img.size > 0:
                    crop_filename = f"{det_id}_crop.jpg"
                    crop_full_path = cam_dir / crop_filename
                    cv2.imwrite(str(crop_full_path), crop_img)
                    crop_path = f"/media/evidence/{camera_id}/{video_id}/{crop_filename}"

            # Save full annotated evidence image
            timestamp_str = f"{timestamp_seconds:.1f}".replace(".", "_")
            img_filename = f"{det_id}_frame.jpg"
            img_full_path = cam_dir / img_filename
            cv2.imwrite(str(img_full_path), annotated_frame)
            image_path = f"/media/evidence/{camera_id}/{video_id}/{img_filename}"

            record = {
                "evidence_id": f"ev_{det_id}",
                "video_id": video_id,
                "camera_id": str(camera_id),
                "detection_id": det_id,
                "timestamp_seconds": float(timestamp_seconds),
                "frame_number": int(frame_number),
                "image_path": image_path,
                "crop_path": crop_path,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }

            try:
                evidence_col.update_one(
                    {"evidence_id": record["evidence_id"]},
                    {"$set": record},
                    upsert=True,
                )
            except Exception as e:
                logger.warning("Failed to store evidence record in MongoDB: {}", e)

            created_records.append(record)

    return created_records


def generate_privacy_safe_evidence(raw_image_rel_path: str) -> Optional[str]:
    """
    Given a relative evidence image URL (e.g. /media/evidence/CAM-01/vid1/det1_frame.jpg),
    read the original file, detect faces/human regions, apply Gaussian blur,
    and save under PRIVACY_DIR without modifying original raw evidence.
    """
    try:
        # Convert relative URL path to filesystem path
        sub_path = raw_image_rel_path.replace("/media/evidence/", "")
        abs_raw_path = EVIDENCE_DIR / sub_path

        if not abs_raw_path.exists():
            return None

        privacy_sub_path = PRIVACY_DIR / sub_path
        privacy_sub_path.parent.mkdir(parents=True, exist_ok=True)

        img = cv2.imread(str(abs_raw_path))
        if img is None:
            return None

        cascade = _get_face_cascade()
        if cascade is not None:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(24, 24))
            for (x, y, w, h) in faces:
                face_roi = img[y:y+h, x:x+w]
                if face_roi.size > 0:
                    # Apply heavy Gaussian blur to faces
                    blurred_roi = cv2.GaussianBlur(face_roi, (55, 55), 30)
                    img[y:y+h, x:x+w] = blurred_roi

        cv2.imwrite(str(privacy_sub_path), img)
        return f"/media/evidence/privacy/{sub_path}"
    except Exception as e:
        logger.warning("Failed to generate privacy safe evidence: {}", e)
        return None


def verify_evidence(
    candidate: Dict[str, Any],
    query_params: Dict[str, Any],
    min_confidence: float = 0.25,
) -> Tuple[bool, float, str]:
    """
    Verify candidate retrieval result against expected constraints.
    Returns (is_valid, verification_score, reasoning).
    """
    score = 1.0
    reasons = []

    # Check camera match
    expected_cam = query_params.get("camera_id")
    cand_cam = candidate.get("camera_id")
    if expected_cam is not None and cand_cam is not None:
        if str(expected_cam).strip().lower() != str(cand_cam).strip().lower():
            reasons.append(f"Camera mismatch: expected {expected_cam}, got {cand_cam}")
            score -= 0.5

    # Check object class match
    expected_obj = query_params.get("objects.object_name") or query_params.get("object_class")
    cand_obj = candidate.get("object_class") or candidate.get("object_name") or candidate.get("object")
    if expected_obj and cand_obj:
        exp_low = str(expected_obj).strip().lower()
        cand_low = str(cand_obj).strip().lower()
        # Accept plural/singular variations (e.g. person vs people, car vs cars)
        if exp_low not in cand_low and cand_low not in exp_low:
            syns = {"people": "person", "cars": "car", "vehicles": "car", "bikes": "bicycle"}
            norm_exp = syns.get(exp_low, exp_low)
            norm_cand = syns.get(cand_low, cand_low)
            if norm_exp != norm_cand:
                reasons.append(f"Object mismatch: expected {expected_obj}, got {cand_obj}")
                score -= 0.4

    # Check detection confidence if available (specifically YOLO detection confidence)
    det_conf = candidate.get("detection_confidence")
    if det_conf is None and "confidence" in candidate:
        # Only use confidence if candidate is structured/hybrid, not pure retrieval score
        if candidate.get("source") != "semantic":
            det_conf = candidate.get("confidence")

    if det_conf is not None:
        try:
            d_val = float(det_conf)
            if d_val < min_confidence:
                reasons.append(f"Low detection confidence: {d_val:.2f} < {min_confidence}")
                score -= 0.3
        except Exception:
            pass

    is_valid = score >= 0.5
    explanation = "; ".join(reasons) if reasons else "Verified against stored ground detection"
    return is_valid, max(0.0, score), explanation
