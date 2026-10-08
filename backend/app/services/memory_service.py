from __future__ import annotations

import re
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from loguru import logger

from backend.app.db.mongo import conversations as conversations_col, memory as memory_col, videos as videos_col, cameras as cameras_col

PRONOUN_MAP = {
    "he": ["person", "man", "guy", "male"],
    "she": ["person", "woman", "lady", "female"],
    "they": ["person", "people", "group"],
    "that person": ["person"],
    "the person": ["person"],
    "the car": ["car", "vehicle"],
    "that car": ["car", "vehicle"],
    "same person": ["person"],
    "same vehicle": ["car", "vehicle", "truck", "bus"],
    "that vehicle": ["car", "vehicle", "truck", "bus"],
    "previous result": ["any"],
}


def get_conversation_memory(conversation_id: str) -> List[Dict[str, Any]]:
    """Retrieve all memory records for a given conversation ID, ordered by creation time."""
    try:
        records = list(
            memory_col.find({"conversation_id": conversation_id}, {"_id": 0}).sort("created_at", 1)
        )
        return records
    except Exception as e:
        logger.warning("Failed to fetch conversation memory from MongoDB: {}", e)
        return []


def get_latest_grounded_entity(conversation_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve the most recently grounded entity from conversation memory."""
    try:
        rec = memory_col.find_one(
            {"conversation_id": conversation_id, "selected_entity": {"$ne": None}},
            {"_id": 0},
            sort=[("created_at", -1)],
        )
        if rec and isinstance(rec.get("selected_entity"), dict):
            return rec["selected_entity"]
        return None
    except Exception as e:
        logger.warning("Failed to get latest grounded entity: {}", e)
        return None


def store_memory_turn(
    conversation_id: str,
    query: str,
    clarification_question: Optional[str] = None,
    clarification_answer: Optional[str] = None,
    selected_entity: Optional[Dict[str, Any]] = None,
    camera_id: Optional[str] = None,
    video_id: Optional[str] = None,
    detection_id: Optional[str] = None,
    identity_id: Optional[str] = None,
    timestamp: Optional[str] = None,
) -> Dict[str, Any]:
    """Persist clarification memory turn to MongoDB."""
    record = {
        "conversation_id": conversation_id,
        "message_id": f"mem_{int(datetime.now(timezone.utc).timestamp()*1000)}",
        "query": query,
        "clarification_question": clarification_question,
        "clarification_answer": clarification_answer,
        "selected_entity": selected_entity,
        "camera_id": camera_id,
        "video_id": video_id,
        "detection_id": detection_id,
        "identity_id": identity_id,
        "timestamp": timestamp,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        memory_col.insert_one(record)
        # Also update parent conversation document
        conversations_col.update_one(
            {"conversation_id": conversation_id},
            {
                "$set": {
                    "last_updated": datetime.now(timezone.utc).isoformat(),
                    "last_entity": selected_entity,
                },
                "$setOnInsert": {
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            },
            upsert=True,
        )
    except Exception as e:
        logger.warning("Failed to persist conversation memory turn: {}", e)

    return record


def resolve_entity_references(
    conversation_id: str,
    query: str,
    parsed_filter: Dict[str, Any],
) -> Tuple[Dict[str, Any], bool, Optional[str]]:
    """
    Inspect user query for pronouns or entity references ('he', 'the car', 'where did he go next').
    If references are found, resolve them against grounded conversation memory.
    
    Returns (updated_parsed_filter, clarification_required, clarification_question).
    """
    from backend.app.db.mongo import videos as videos_col, cameras as cameras_col

    # If video_id, camera_id, or location hint is ALREADY present or scoped, no clarification needed!
    if parsed_filter.get("video_id") or parsed_filter.get("camera_id") or parsed_filter.get("__location_hint"):
        return parsed_filter, False, None

    # Check database scope: active registered videos / cameras
    try:
        active_vids = list(videos_col.find({}, {"video_id": 1, "camera_id": 1, "camera_name": 1}).limit(5))
        active_cams = list(cameras_col.find({}, {"camera_id": 1, "location": 1, "name": 1}).limit(5))
    except Exception:
        active_vids = []
        active_cams = []

    # If only 1 video or 1 camera exists in DB, bind it directly — zero ambiguity!
    if len(active_vids) == 1:
        parsed_filter["video_id"] = active_vids[0].get("video_id")
        parsed_filter["camera_id"] = str(active_vids[0].get("camera_id"))
        return parsed_filter, False, None
    elif len(active_cams) == 1 and not active_vids:
        parsed_filter["camera_id"] = str(active_cams[0].get("camera_id"))
        return parsed_filter, False, None

    query_low = query.strip().lower()

    # Check for pronoun / referential matches
    referenced_pronoun = None
    for pronoun in PRONOUN_MAP.keys():
        if re.search(rf"\b{re.escape(pronoun)}\b", query_low):
            referenced_pronoun = pronoun
            break

    if not referenced_pronoun:
        return parsed_filter, False, None

    # Load latest grounded entity from memory
    entity = get_latest_grounded_entity(conversation_id)

    if not entity:
        # Check if conversation has any previous camera or video mentions
        recent_memory = get_conversation_memory(conversation_id)
        if recent_memory:
            last_cam = None
            last_vid = None
            for m in reversed(recent_memory):
                if m.get("video_id"):
                    last_vid = m.get("video_id")
                if m.get("camera_id"):
                    last_cam = m.get("camera_id")
                if last_vid or last_cam:
                    break
            if last_vid:
                parsed_filter["video_id"] = last_vid
            if last_cam:
                parsed_filter["camera_id"] = str(last_cam)
            if last_vid or last_cam:
                return parsed_filter, False, None

        # Only trigger clarification if multiple distinct cameras/videos exist AND scope is ungrounded
        if len(active_vids) > 1 or len(active_cams) > 1:
            question = "Which camera or entity are you referring to? (e.g. Main Gate, Parking, or Lobby)"
            return parsed_filter, True, question

        return parsed_filter, False, None

    # Inject grounded entity details into parsed filter
    if entity.get("camera_id"):
        parsed_filter["camera_id"] = str(entity["camera_id"])
    if entity.get("object_class"):
        parsed_filter["objects.object_name"] = entity["object_class"]
    if entity.get("identity_id"):
        parsed_filter["identity_id"] = entity["identity_id"]
    if entity.get("video_id"):
        parsed_filter["video_id"] = entity["video_id"]

    parsed_filter["__resolved_pronoun"] = referenced_pronoun
    parsed_filter["__grounded_entity"] = entity

    return parsed_filter, False, None
