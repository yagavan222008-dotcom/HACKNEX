from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timezone
from loguru import logger

from backend.app.db.mongo import identities as identities_col, identity_observations as obs_col, detections as detections_col
from backend.app.services.topology_service import is_transition_plausible
from backend.app.services.person_store import search_persons, store_person_vector


def match_or_create_identity(
    crop_img_path: Optional[str],
    camera_id: str,
    video_id: str,
    timestamp_seconds: float,
    detection_id: str,
    evidence_url: Optional[str] = None,
    track_id: Optional[int] = None,
    attributes: Optional[Dict[str, Any]] = None,
    min_similarity: float = 0.65,
) -> Dict[str, Any]:
    """
    Perform cross-camera person Re-ID using visual similarity, timestamp consistency, and topology plausibility.
    Assigns or updates an identity_id record and stores observation.
    """
    camera_id_str = str(camera_id)
    now_iso = datetime.now(timezone.utc).isoformat()
    matched_identity_id = None
    best_match_score = 0.0

    # Step 1: Query vector similarity if crop image is available
    if crop_img_path:
        try:
            matches = search_persons(crop_path=crop_img_path, top_k=5)
            for m in matches:
                cand_id = m.get("identity_id") or m.get("track_id")
                sim = float(m.get("score") or m.get("similarity") or 0.0)

                if cand_id and sim >= min_similarity:
                    # Verify topology plausibility against existing observations of this candidate
                    last_obs = obs_col.find_one(
                        {"identity_id": str(cand_id)},
                        sort=[("timestamp_seconds", -1)],
                    )
                    if last_obs:
                        src_cam = last_obs.get("camera_id")
                        last_ts = float(last_obs.get("timestamp_seconds") or 0.0)
                        delta_t = abs(timestamp_seconds - last_ts)

                        is_plausible, _ = is_transition_plausible(src_cam, camera_id_str, delta_t)
                        if not is_plausible:
                            continue

                    if sim > best_match_score:
                        best_match_score = sim
                        matched_identity_id = str(cand_id)
        except Exception as e:
            logger.debug("Re-ID vector search skipped or failed: {}", e)

    # Step 2: Fallback to track_id inside same camera/video if vector match wasn't conclusive
    if not matched_identity_id and track_id is not None:
        existing_track_obs = obs_col.find_one(
            {"camera_id": camera_id_str, "video_id": video_id, "track_id": track_id}
        )
        if existing_track_obs:
            matched_identity_id = existing_track_obs["identity_id"]
            best_match_score = 0.90

    # Step 3: Create new identity if no match found
    if not matched_identity_id:
        count = identities_col.count_documents({})
        matched_identity_id = f"Person-{(count + 1):03d}"

        identity_doc = {
            "identity_id": matched_identity_id,
            "created_at": now_iso,
            "first_camera": camera_id_str,
            "first_seen_seconds": timestamp_seconds,
            "attributes": attributes or {},
        }
        try:
            identities_col.update_one(
                {"identity_id": matched_identity_id},
                {"$set": identity_doc},
                upsert=True,
            )
        except Exception:
            pass

    # Record observation
    obs_record = {
        "obs_id": f"obs_{matched_identity_id}_{camera_id_str}_{int(timestamp_seconds)}",
        "identity_id": matched_identity_id,
        "camera_id": camera_id_str,
        "video_id": video_id,
        "detection_id": detection_id,
        "track_id": track_id,
        "timestamp_seconds": float(timestamp_seconds),
        "timestamp_formatted": f"{int(timestamp_seconds//60):02d}:{int(timestamp_seconds%60):02d}",
        "evidence_url": evidence_url,
        "crop_path": crop_img_path,
        "confidence": round(best_match_score if best_match_score > 0 else 0.85, 2),
        "created_at": now_iso,
    }

    try:
        obs_col.update_one(
            {"obs_id": obs_record["obs_id"]},
            {"$set": obs_record},
            upsert=True,
        )
    except Exception as e:
        logger.warning("Failed to store identity observation: {}", e)

    # Update detection record with assigned identity_id
    try:
        detections_col.update_one(
            {"detection_id": detection_id},
            {"$set": {"identity_id": matched_identity_id}},
        )
    except Exception:
        pass

    return obs_record


def reconstruct_journey(identity_id: str) -> Dict[str, Any]:
    """
    Reconstruct chronological cross-camera journey for a specific identity.
    Returns ordered timeline of observations with next_camera transitions.
    """
    obs_list = list(
        obs_col.find({"identity_id": identity_id}, {"_id": 0}).sort("timestamp_seconds", 1)
    )

    if not obs_list:
        return {
            "identity_id": identity_id,
            "observation_count": 0,
            "timeline": [],
            "journey_summary": "No observations found for this identity.",
        }

    timeline = []
    for i, obs in enumerate(obs_list):
        next_obs = obs_list[i + 1] if (i + 1) < len(obs_list) else None
        next_camera = next_obs.get("camera_id") if next_obs else None
        travel_time = round(next_obs["timestamp_seconds"] - obs["timestamp_seconds"], 1) if next_obs else None

        item = {
            "step": i + 1,
            "camera_id": obs.get("camera_id"),
            "video_id": obs.get("video_id"),
            "timestamp_seconds": obs.get("timestamp_seconds"),
            "timestamp": obs.get("timestamp_formatted") or f"{int(obs.get('timestamp_seconds', 0)//60):02d}:{int(obs.get('timestamp_seconds', 0)%60):02d}",
            "evidence_url": obs.get("evidence_url"),
            "confidence": obs.get("confidence", 0.85),
            "next_camera": next_camera,
            "travel_time_seconds": travel_time,
        }
        timeline.append(item)

    cams = [t["camera_id"] for t in timeline]
    cam_str = " → ".join(cams)
    start_t = timeline[0]["timestamp"]
    end_t = timeline[-1]["timestamp"]

    return {
        "identity_id": identity_id,
        "observation_count": len(timeline),
        "start_time": start_t,
        "end_time": end_t,
        "cameras_visited": list(set(cams)),
        "route": cam_str,
        "timeline": timeline,
        "journey_summary": f"Observed across route [{cam_str}] between {start_t} and {end_t}",
    }


def list_all_identities(limit: int = 50) -> List[Dict[str, Any]]:
    """List distinct identities and their summary observation details."""
    try:
        ids = list(identities_col.find({}, {"_id": 0}).limit(limit))
        for item in ids:
            iid = item.get("identity_id")
            obs_cnt = obs_col.count_documents({"identity_id": iid})
            item["total_observations"] = obs_cnt
        return ids
    except Exception as e:
        logger.warning("Failed to list identities: {}", e)
        return []
