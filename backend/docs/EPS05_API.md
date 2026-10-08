# EPS05 API Documentation: HACKNEX 2026

**FastAPI Swagger UI:** `http://localhost:8000/docs`  
**Root Info:** `http://localhost:8000/`  

---

## 1. Video Ingestion & Registry APIs

### `POST /api/videos/register`
Register a CCTV video segment metadata.

**Request:**
```json
{
  "camera_id": "CAM-01",
  "camera_name": "Main Gate",
  "file_path": "data/videos/gate.mp4",
  "video_id": "vid_gate_01",
  "start_time": "00:00:00"
}
```

### `GET /api/videos`
List registered CCTV videos with status and metadata.

### `POST /api/videos/{video_id}/process`
Trigger background frame extraction, YOLO object detection, evidence frame generation, and CLIP embedding indexing.

**Request:**
```json
{
  "sampling_interval_sec": 1.0,
  "force_reprocess": false
}
```

### `GET /api/videos/{video_id}/status`
Get processing status (`registered` | `processing` | `completed` | `failed` | `stopped`) and progress percentage.

### `GET /api/videos/{video_id}/seek?timestamp=42.0`
Return exact video playback URL and offset timestamp for video player seeking.

---

## 2. Search & Retrieval APIs

### `POST /api/search/query`
Execute unified EPS05 hybrid natural language search.

**Request:**
```json
{
  "conversation_id": "conv_001",
  "query": "Find the red car at the main gate",
  "limit": 10
}
```

**Response:**
```json
{
  "conversation_id": "conv_001",
  "interpreted_query": {
    "objects.object_name": "car",
    "objects.color": "Red",
    "camera_id": "CAM-01"
  },
  "clarification_required": false,
  "clarification_question": null,
  "results": [
    {
      "result_id": "res_conv_001_1",
      "camera_id": "CAM-01",
      "camera_name": "Main Gate",
      "video_id": "vid_gate_01",
      "timestamp_seconds": 42.0,
      "timestamp": "00:42",
      "object_class": "car",
      "confidence": 0.91,
      "semantic_score": 0.87,
      "evidence_url": "/media/evidence/CAM-01/vid_gate_01/det_42_frame.jpg",
      "crop_url": "/media/evidence/CAM-01/vid_gate_01/det_42_crop.jpg",
      "video_url": "/media/recordings/gate.mp4",
      "video_offset": 42.0,
      "detection_id": "det_42",
      "identity_id": "Vehicle-001",
      "explanation": "Verified against ground evidence"
    }
  ],
  "answer": "Found 1 red car match at Main Gate at timestamp 00:42.",
  "latency_ms": 42.5,
  "evidence": [...]
}
```

---

## 3. Identities & Journey Reconstruction APIs

### `GET /api/identities`
List tracked identities across multi-camera streams.

### `GET /api/identities/{identity_id}/journey`
Retrieve chronologically ordered multi-camera journey reconstruction.

**Response:**
```json
{
  "identity_id": "Person-017",
  "observation_count": 3,
  "start_time": "00:42",
  "end_time": "02:08",
  "cameras_visited": ["CAM-01", "CAM-02", "CAM-03"],
  "route": "CAM-01 → CAM-02 → CAM-03",
  "timeline": [
    {
      "step": 1,
      "camera_id": "CAM-01",
      "timestamp": "00:42",
      "evidence_url": "/media/evidence/CAM-01/vid1/det1_frame.jpg",
      "next_camera": "CAM-02",
      "travel_time_seconds": 35.0
    },
    {
      "step": 2,
      "camera_id": "CAM-02",
      "timestamp": "01:17",
      "evidence_url": "/media/evidence/CAM-02/vid2/det2_frame.jpg",
      "next_camera": "CAM-03",
      "travel_time_seconds": 51.0
    },
    {
      "step": 3,
      "camera_id": "CAM-03",
      "timestamp": "02:08",
      "evidence_url": "/media/evidence/CAM-03/vid3/det3_frame.jpg",
      "next_camera": null,
      "travel_time_seconds": null
    }
  ]
}
```

---

## 4. Evaluation & Benchmarking APIs

### `POST /api/evaluation/run`
Run held-out query evaluation suite (`mode="PROPOSED"` or `mode="BASELINE"`).

### `GET /api/evaluation/results`
Get historical benchmark run reports.

---

## 5. System Status APIs

### `GET /api/system/status`
Backend, MongoDB, AI models, vector index, and active video processing jobs status.

### `GET /api/system/models`
AI model loading status (`yolo`, `clip`, `reid`).
