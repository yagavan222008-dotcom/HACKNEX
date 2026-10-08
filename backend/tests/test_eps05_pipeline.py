from __future__ import annotations

import sys
import os
from pathlib import Path

# Ensure project root E:\hacknex is in sys.path
project_root = str(Path(__file__).resolve().parent.parent.parent)
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# Also ensure backend folder is in sys.path for app imports
backend_root = str(Path(__file__).resolve().parent.parent)
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

import pytest
import numpy as np
from fastapi.testclient import TestClient


from backend.app.main import app
from backend.app.services.video_ingestion import probe_video_file, register_video
from backend.app.services.evidence_service import generate_evidence_frame, generate_privacy_safe_evidence, verify_evidence
from backend.app.services.memory_service import store_memory_turn, resolve_entity_references, get_latest_grounded_entity
from backend.app.services.topology_service import is_transition_plausible
from backend.app.services.reid_service import match_or_create_identity, reconstruct_journey
from backend.app.services.reasoning_engine import extract_temporal_operator, apply_temporal_spatial_reasoning
from backend.app.db.mongo import db
from backend.evaluation.evaluator import run_evaluation_benchmark

client = TestClient(app)


def test_system_status_endpoints():
    """Test system status and models API endpoints."""
    res_status = client.get("/api/system/status")
    assert res_status.status_code == 200
    data_status = res_status.json()
    assert data_status["backend"] == "online"
    assert "models" in data_status
    assert "video_processing" in data_status

    res_models = client.get("/api/system/models")
    assert res_models.status_code == 200
    data_models = res_models.json()
    assert "yolo" in data_models


def test_video_registration():
    """Test CCTV video segment metadata registration."""
    # Create a dummy video file if none exists
    dummy_dir = Path("data/videos")
    dummy_dir.mkdir(parents=True, exist_ok=True)
    dummy_path = dummy_dir / "test_cam01.mp4"

    if not dummy_path.exists():
        # Create minimal 1-frame dummy mp4/file for unit test
        with open(dummy_path, "wb") as f:
            f.write(b"0" * 1024)

    reg = register_video(
        camera_id="CAM-01",
        camera_name="Main Gate",
        file_path=str(dummy_path),
        video_id="vid_test_01",
    )
    assert reg["video_id"] == "vid_test_01"
    assert reg["camera_id"] == "CAM-01"
    assert reg["processing_status"] in ["registered", "completed"]


def test_evidence_generation_and_privacy():
    """Test evidence frame generation and privacy face blurring."""
    dummy_frame = np.zeros((100, 100, 3), dtype=np.uint8)
    dummy_dets = [
        {
            "detection_id": "det_test_1",
            "object_class": "person",
            "confidence": 0.95,
            "bbox": [10, 10, 50, 50],
        }
    ]

    records = generate_evidence_frame(
        frame=dummy_frame,
        video_id="vid_test_01",
        camera_id="CAM-01",
        timestamp_seconds=42.0,
        frame_number=1050,
        detections_list=dummy_dets,
    )
    assert len(records) == 1
    rec = records[0]
    assert rec["timestamp_seconds"] == 42.0
    assert rec["camera_id"] == "CAM-01"
    assert "image_path" in rec

    # Test evidence verification
    cand = {
        "camera_id": "CAM-01",
        "object_class": "person",
        "confidence": 0.95,
        "timestamp_seconds": 42.0,
    }
    is_valid, score, exp = verify_evidence(cand, {"camera_id": "CAM-01", "objects.object_name": "person"})
    assert is_valid is True
    assert score > 0.5


def test_memory_and_entity_resolution():
    """Test persistent clarification memory turn storage and pronoun reference resolution."""
    conv_id = "test_conv_999"
    entity = {
        "camera_id": "CAM-01",
        "video_id": "vid_test_01",
        "object_class": "car",
        "identity_id": "Vehicle-001",
        "timestamp_seconds": 42.0,
    }

    store_memory_turn(
        conversation_id=conv_id,
        query="Find the red car at the main gate",
        selected_entity=entity,
        camera_id="CAM-01",
        video_id="vid_test_01",
    )

    grounded = get_latest_grounded_entity(conv_id)
    assert grounded is not None
    assert grounded["camera_id"] == "CAM-01"

    # Test resolving "where did it go next"
    parsed, req_clarify, q = resolve_entity_references(
        conversation_id=conv_id,
        query="Where did that car go next?",
        parsed_filter={},
    )

    assert req_clarify is False
    assert parsed.get("camera_id") == "CAM-01"
    assert parsed.get("objects.object_name") == "car"


def test_topology_and_reid():
    """Test camera topology plausibility and cross-camera Re-ID journey reconstruction."""
    plausible, msg = is_transition_plausible("CAM-01", "CAM-02", time_delta_seconds=35.0)
    assert plausible is True

    # Record observations for an identity
    obs1 = match_or_create_identity(
        crop_img_path=None,
        camera_id="CAM-01",
        video_id="vid_01",
        timestamp_seconds=42.0,
        detection_id="det_1",
        track_id=1,
    )
    identity_id = obs1["identity_id"]

    obs2 = match_or_create_identity(
        crop_img_path=None,
        camera_id="CAM-02",
        video_id="vid_02",
        timestamp_seconds=77.0,
        detection_id="det_2",
        track_id=1,
    )

    journey = reconstruct_journey(identity_id)
    assert journey["identity_id"] == identity_id
    assert journey["observation_count"] >= 1
    assert "route" in journey


def test_temporal_reasoning():
    """Test natural language temporal operator extraction and filtering."""
    op, meta = extract_temporal_operator("Where did he go after main gate?")
    assert op == "AFTER"

    candidates = [
        {"timestamp_seconds": 20.0, "camera_id": "CAM-01"},
        {"timestamp_seconds": 50.0, "camera_id": "CAM-02"},
    ]
    filtered = apply_temporal_spatial_reasoning(
        candidates,
        parsed_filter={"reference_timestamp_seconds": 30.0},
        query="Where did he go after main gate?",
    )
    assert len(filtered) == 1
    assert filtered[0]["timestamp_seconds"] == 50.0


def test_search_api_endpoint():
    """Test POST /api/search/query unified endpoint."""
    payload = {
        "conversation_id": "test_search_conv",
        "query": "Find the car at main gate",
        "limit": 5,
    }
    res = client.post("/api/search/query", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "interpreted_query" in data
    assert "results" in data
    assert "latency_ms" in data


def test_evaluation_benchmark():
    """Test held-out benchmark evaluation execution."""
    eval_res = run_evaluation_benchmark(mode="PROPOSED")
    assert eval_res["mode"] == "PROPOSED"
    assert "top1_accuracy" in eval_res
    assert "mean_query_latency_ms" in eval_res


def test_video_streaming_and_evidence_endpoints():
    """Test HTTP 200/206 Range video streaming and evidence image serving endpoints."""
    dummy_dir = Path("data/videos")
    dummy_dir.mkdir(parents=True, exist_ok=True)
    dummy_path = dummy_dir / "test_stream.mp4"
    if not dummy_path.exists():
        with open(dummy_path, "wb") as f:
            f.write(b"video_bytes_dummy_1234567890" * 50)

    reg = register_video(
        camera_id="CAM-01",
        camera_name="Main Gate",
        file_path=str(dummy_path),
        video_id="vid_test_stream_01",
    )
    assert reg["video_id"] == "vid_test_stream_01"

    # Test GET /api/videos/{video_id}/stream full stream (HTTP 200)
    res_full = client.get("/api/videos/vid_test_stream_01/stream")
    assert res_full.status_code == 200
    assert res_full.headers.get("accept-ranges") == "bytes"
    assert res_full.headers.get("content-type") == "video/mp4"

    # Test GET /api/videos/{video_id}/stream Range stream (HTTP 206 Partial Content)
    res_range = client.get(
        "/api/videos/vid_test_stream_01/stream",
        headers={"Range": "bytes=0-99"}
    )
    assert res_range.status_code == 206
    assert "bytes 0-99/" in res_range.headers.get("content-range", "")
    assert res_range.headers.get("accept-ranges") == "bytes"
    assert len(res_range.content) == 100

    # Test GET non-existent video stream returns 404
    res_404 = client.get("/api/videos/non_existent_vid_9999/stream")
    assert res_404.status_code == 404

    # Test evidence image serving endpoint
    ev_dir = Path("data/evidence")
    ev_dir.mkdir(parents=True, exist_ok=True)
    ev_path = ev_dir / "ev_test_unit.jpg"
    with open(ev_path, "wb") as f:
        f.write(b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00\x48\x00\x48\x00\x00\xff\xd9")

    res_ev = client.get(f"/api/evidence/image?path={ev_path}")
    assert res_ev.status_code == 200
    assert res_ev.headers.get("content-type") == "image/jpeg"


def test_search_ground_evidence_metadata_and_verification():
    """Verify search response schema contains database-backed fields, non-generic object classes, valid URLs, and metrics."""
    from backend.app.db.mongo import videos as videos_col, detections as detections_col, evidence as evidence_col

    dummy_dir = Path("data/videos")
    dummy_dir.mkdir(parents=True, exist_ok=True)
    dummy_path = dummy_dir / "test_cam01.mp4"
    if not dummy_path.exists():
        with open(dummy_path, "wb") as f:
            f.write(b"0" * 1024)

    register_video(
        camera_id="CAM-01",
        camera_name="Main Gate",
        file_path=str(dummy_path),
        video_id="vid_test_01",
    )

    ev_dir = Path("data/evidence/CAM-01/vid_test_01")
    ev_dir.mkdir(parents=True, exist_ok=True)
    ev_path = ev_dir / "det_test_car_1_frame.jpg"
    with open(ev_path, "wb") as f:
        f.write(b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00\x48\x00\x48\x00\x00\xff\xd9")

    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()

    det_doc = {
        "detection_id": "det_test_car_1",
        "evidence_id": "ev_test_car_1",
        "video_id": "vid_test_01",
        "camera_id": "CAM-01",
        "camera_name": "Main Gate",
        "frame_number": 1050,
        "timestamp_seconds": 42.0,
        "timestamp_formatted": "00:42",
        "timestamp": now_iso,
        "object_class": "car",
        "confidence": 0.92,
        "evidence_path": str(ev_path.resolve()),
        "crop_path": str(ev_path.resolve()),
        "objects": [{"object_name": "car", "confidence": 0.92}],
        "created_at": now_iso,
    }
    detections_col.update_one({"detection_id": det_doc["detection_id"]}, {"$set": det_doc}, upsert=True)

    payload = {
        "conversation_id": "test_search_verification",
        "query": "find car",
        "limit": 5,
    }
    res = client.post("/api/search/query", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "results" in data
    results = data["results"]
    assert len(results) >= 1

    item = results[0]
    # 1. Real object class, never generic "Detection"
    assert item["object_class"] in ["car", "person", "truck", "bus", "bicycle", "motorcycle", "backpack"]
    assert item["object_class"] != "Detection"

    # 2. Non-null timestamp_seconds and formatted timestamp
    assert item["timestamp_seconds"] is not None
    assert isinstance(item["timestamp_seconds"], (int, float))
    assert item["timestamp"] is not None
    assert ":" in item["timestamp"]

    # 3. Video ID & Camera ID & Camera Name
    assert item["video_id"] is not None and len(item["video_id"]) > 0
    assert item["camera_id"] is not None
    assert item["camera_name"] is not None

    # 4. Evidence ID & Detection ID
    assert item["detection_id"] is not None
    assert item["evidence_id"] is not None

    # 5. URLs
    assert item["evidence_url"] is not None and item["evidence_url"].startswith("/api/evidence/")
    assert item["stream_url"] is not None and item["stream_url"].startswith("/api/videos/")

    # 6. Separate Metrics
    assert item["detection_confidence"] is not None
    assert item["retrieval_score"] is not None

    # 7. Endpoint HTTP fetch tests
    ev_res = client.get(item["evidence_url"])
    assert ev_res.status_code == 200
    assert ev_res.headers.get("content-type") == "image/jpeg"

    stream_res = client.get(item["stream_url"])
    assert stream_res.status_code == 200
    assert stream_res.headers.get("content-type") == "video/mp4"


def test_uploaded_video_search_bypasses_clarification():
    """Test that specifying video_id in search query bypasses entity clarification."""
    parsed_filter = {"video_id": "vid_1_1791474567", "camera_id": "1"}
    filter_out, clarify, question = resolve_entity_references("conv_test", "find the car", parsed_filter)
    assert clarify is False
    assert filter_out.get("video_id") == "vid_1_1791474567"


def test_multi_camera_pronoun_triggers_clarification():
    """Test that ambiguous pronoun query without bound video scope across multiple cameras triggers clarification."""
    from unittest.mock import patch, MagicMock
    mock_videos_col = MagicMock()
    mock_videos_col.find.return_value.limit.return_value = [
        {"video_id": "test_cam_a", "camera_id": "101", "camera_name": "Gate A"},
        {"video_id": "test_cam_b", "camera_id": "102", "camera_name": "Gate B"},
    ]
    with patch("backend.app.services.memory_service.videos_col", mock_videos_col):
        filter_out, clarify, question = resolve_entity_references("conv_test_multi", "Where did he go?", {})
        assert clarify is True
        assert question is not None
        assert "camera" in question.lower()



