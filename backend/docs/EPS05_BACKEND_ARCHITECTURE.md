# EPS05 Backend Architecture Documentation

**System:** EPS05 — Multi-Stream Video Intelligence with Conversational Query  
**Framework:** FastAPI + MongoDB + PyTorch + Ultralytics YOLO + OpenCLIP + OpenVINO  

---

## 1. End-to-End Pipeline Architecture

```
RECORDED CCTV VIDEOS (data/videos/)
        │
        ▼
MULTI-CAMERA VIDEO INGESTION & REGISTRY (backend/app/services/video_ingestion.py)
        │
        ▼
FRAME EXTRACTION & TIMESTAMP CALCULATOR (frame_number -> timestamp_seconds, timestamp_formatted)
        │
        ▼
YOLO OBJECT DETECTION & DENSITY ANNOTATION (Ultralytics YOLO)
        │
        ├─────────────────────────────┬─────────────────────────────┐
        ▼                             ▼                             ▼
MONGODB EVENT STORAGE         EVIDENCE FRAME GENERATOR     CLIP / VISUAL EMBEDDER
(detections, events, tracks)  (data/evidence/{cam}/{vid}/) (FAISS Vector Index)
        │                             │                             │
        └─────────────────────────────┼─────────────────────────────┘
                                      ▼
                        HYBRID SEARCH & RE-RANKING ENGINE (backend/app/services/unified_retrieval.py)
                                      │
                                      ▼
                      NATURAL LANGUAGE QUERY UNDERSTANDING (backend/app/services/nl_parser.py)
                                      │
                                      ▼
                      EVIDENCE VERIFICATION & PRIVACY MODE (backend/app/services/evidence_service.py)
                                      │
                                      ▼
                   PERSISTENT CLARIFICATION MEMORY & ENTITY RESOLUTION
                                      │
                                      ▼
                      CROSS-CAMERA RE-ID & TOPOLOGY VALIDATION
                                      │
                                      ▼
                   JOURNEY RECONSTRUCTION (GET /api/identities/{id}/journey)
                                      │
                                      ▼
                     EVALUATION & BENCHMARKING FRAMEWORK (backend/evaluation/)
```

---

## 2. Core Architecture Subsystems

### 2.1 Video Ingestion & Timestamp Engine
- Recorded CCTV videos registered with camera metadata (`CAM-01`, `CAM-02`, `CAM-03`).
- Frame sampling calculated via video FPS to yield exact `timestamp_seconds` and `timestamp_formatted` (`00:42`).
- Asynchronous, resumable background processing with status & progress polling.

### 2.2 Evidence Generation & Privacy Mode
- Annotated evidence images saved under `data/evidence/{camera_id}/{video_id}/{det_id}_frame.jpg`.
- Cropped object patches saved under `data/evidence/{camera_id}/{video_id}/{det_id}_crop.jpg`.
- Privacy mode blurring produces face-blurred displayed evidence under `data/evidence/privacy/` without altering raw originals.

### 2.3 Clarification-Once Memory & Entity Resolution
- Grounded entity references persisted across turns in MongoDB (`conversations`, `memory`).
- Resolves pronouns ("he", "she", "the car", "that person", "where did he go next") against previous grounded observations.

### 2.4 Cross-Camera Re-ID & Topology
- Appearance similarity via visual embeddings combined with temporal consistency and camera topology transition bounds.
- Reconstructs chronological multi-camera journey: `CAM-01 (00:42) → CAM-02 (01:17) → CAM-03 (02:08)`.

### 2.5 Evaluation & Latency Benchmarking
- Held-out benchmark query evaluation dataset measuring Top-1/Top-5 accuracy, camera localization accuracy, mean timestamp error, and query latency.
- Baseline vs. Proposed retrieval comparison mode.
