from loguru import logger
from typing import Any, Dict
from pymongo import MongoClient, ASCENDING, DESCENDING, TEXT
from pymongo.collection import Collection
from pymongo.database import Database

from backend.app.config import settings

client: MongoClient = MongoClient(settings.MONGODB_URI)
db: Database = client[settings.MONGO_DB_NAME]

# Collections
cameras: Collection = db["cameras"]
zones: Collection = db["zones"]  # ROIs per camera for crowd/zone-level counts
detections: Collection = db["detections"]
tracks: Collection = db["tracks"]
events: Collection = db["events"]
alerts: Collection = db["alerts"]
alert_logs: Collection = db["alert_logs"]
chat_messages: Collection = db["chat_messages"]
videos: Collection = db["videos"]  # manifest of recorded CCTV video segments
vlm_frames: Collection = db["vlm_frames"]  # semantic frame-level metadata (FAISS stores vectors)
app_settings: Collection = db["settings"]  # app-level settings (e.g., indexing mode)
anomaly_events: Collection = db["anomaly_events"]  # cached daily anomaly detection results

# EPS05 Collections
evidence: Collection = db["evidence"]
identities: Collection = db["identities"]
identity_observations: Collection = db["identity_observations"]
conversations: Collection = db["conversations"]
memory: Collection = db["memory"]
camera_topology: Collection = db["camera_topology"]
evaluation_queries: Collection = db["evaluation_queries"]
evaluation_results: Collection = db["evaluation_results"]


def init_indexes() -> None:
    # cameras
    cameras.create_index([("camera_id", ASCENDING)], unique=True)
    # zones: ROIs per camera (bbox in normalized [0,1] coords)
    try:
        zones.create_index([("camera_id", ASCENDING), ("zone_id", ASCENDING)], unique=True)
    except Exception:
        pass
    # app settings
    try:
        app_settings.create_index([("key", ASCENDING)], unique=True)
    except Exception:
        pass

    # detections: frequent queries by camera, time, video_id, object_class, confidence
    detections.create_index([("camera_id", ASCENDING), ("timestamp_seconds", ASCENDING)])
    detections.create_index([("video_id", ASCENDING), ("timestamp_seconds", ASCENDING)])
    detections.create_index([("camera_id", ASCENDING), ("timestamp", DESCENDING)])
    detections.create_index([("object_class", ASCENDING), ("confidence", DESCENDING)])
    detections.create_index(
        [("objects.object_name", ASCENDING), ("objects.color", ASCENDING), ("timestamp", DESCENDING)]
    )
    # Multi-color array index: supports $in queries matching any of the top-3 colors
    try:
        detections.create_index(
            [("objects.colors", ASCENDING), ("timestamp", DESCENDING)]
        )
    except Exception as e:
        logger.opt(exception=True).warning("Failed to create index on detections (objects.colors / timestamp): {}", e)
    try:
        detections.create_index([("person_count", ASCENDING), ("timestamp", DESCENDING)])
    except Exception:
        pass

    # tracks: per-camera persistent trackers
    try:
        tracks.create_index([("camera_id", ASCENDING), ("track_id", ASCENDING)])
        tracks.create_index([("video_id", ASCENDING), ("track_id", ASCENDING)])
        tracks.create_index([("last_seen", DESCENDING)])
        tracks.create_index([("first_seen", DESCENDING)])
    except Exception:
        pass

    # events: time-based queries, summary search
    events.create_index([("camera_id", ASCENDING), ("start_ts", DESCENDING)])
    events.create_index([("video_id", ASCENDING), ("timestamp_seconds", ASCENDING)])
    events.create_index([("event_type", ASCENDING)])
    try:
        events.create_index([("summary", TEXT)])
    except Exception:
        pass

    # alerts
    alerts.create_index([("enabled", ASCENDING)])
    alerts.create_index([("rule.cameras", ASCENDING)])

    # alert logs
    alert_logs.create_index([("alert_id", ASCENDING), ("triggered_at", DESCENDING)])
    alert_logs.create_index([("camera_id", ASCENDING), ("triggered_at", DESCENDING)])

    # chat messages
    chat_messages.create_index([("session_id", ASCENDING), ("created_at", ASCENDING)])

    # videos (recording segments manifest)
    videos.create_index([("video_id", ASCENDING)], unique=True)
    videos.create_index([("camera_id", ASCENDING), ("start_ts", DESCENDING)])

    # EPS05 Indexes
    try:
        evidence.create_index([("evidence_id", ASCENDING)], unique=True)
        evidence.create_index([("video_id", ASCENDING), ("timestamp_seconds", ASCENDING)])
        evidence.create_index([("camera_id", ASCENDING), ("timestamp_seconds", ASCENDING)])
    except Exception:
        pass

    try:
        identities.create_index([("identity_id", ASCENDING)], unique=True)
        identity_observations.create_index([("identity_id", ASCENDING), ("timestamp_seconds", ASCENDING)])
        identity_observations.create_index([("camera_id", ASCENDING), ("timestamp_seconds", ASCENDING)])
    except Exception:
        pass

    try:
        conversations.create_index([("conversation_id", ASCENDING)], unique=True)
        memory.create_index([("conversation_id", ASCENDING), ("created_at", DESCENDING)])
    except Exception:
        pass

    try:
        camera_topology.create_index([("source_camera", ASCENDING), ("destination_camera", ASCENDING)], unique=True)
    except Exception:
        pass

    try:
        evaluation_queries.create_index([("query_id", ASCENDING)], unique=True)
        evaluation_results.create_index([("eval_run_id", ASCENDING)])
    except Exception:
        pass

    # vlm_frames: semantic search metadata (FAISS holds vectors)
    try:
        vlm_frames.create_index([("clip_path", ASCENDING), ("frame_index", ASCENDING)])
        vlm_frames.create_index([("camera_id", ASCENDING), ("frame_ts", DESCENDING)])
        vlm_frames.create_index([("hash", ASCENDING)])
        vlm_frames.create_index([("model", ASCENDING)])
    except Exception:
        pass

    # anomaly_events: daily anomaly detection cache
    try:
        try:
            anomaly_events.drop_index("date_1")
        except Exception:
            pass
        anomaly_events.create_index(
            [("date", ASCENDING), ("baseline_days", ASCENDING), ("z_threshold", ASCENDING)],
            unique=True,
        )
    except Exception:
        pass


def get_db_info() -> Dict[str, Any]:
    return {
        "name": settings.MONGO_DB_NAME,
        "collections": sorted(db.list_collection_names()),
    }


# Initialize indexes when module is imported
try:
    init_indexes()
except Exception as e:
    logger.opt(exception=True).warning("Failed to initialize MongoDB indexes at import time: {}", e)

