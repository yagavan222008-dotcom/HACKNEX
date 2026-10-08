# EPS05 Backend Audit Document: HACKNEX 2026

**Project:** EPS05 — Multi-Stream Video Intelligence with Conversational Query  
**Target Path:** `E:\hacknex\backend`  
**Date:** October 8, 2026  
**Auditor:** Lead Backend Architect & Senior AI/ML Engineer  

---

## 1. Executive Summary

This document presents a comprehensive audit of the existing HACKNEX 2026 FastAPI + MongoDB surveillance backend (`E:\hacknex\backend`). The existing backend provides solid foundational components including OpenCV/YOLO detection pipelines, OpenVINO attribute extraction, CLIP FAISS indexing, MongoDB detection & tracking storage, and basic NL parsing.

The goal of the EPS05 upgrade is to transform this codebase into a production-grade prototype supporting recorded CCTV multi-camera video ingestion, timestamped event extraction, evidence frame generation, CLIP visual embeddings, natural language query understanding, hybrid retrieval with reranking & evidence verification, persistent clarification-once memory, cross-camera person Re-ID, camera topology, temporal/spatial reasoning, journey reconstruction, alerts, privacy face-blurring, and evaluation benchmarking.

---

## 2. Component Audit Classification

Each subsystem has been inspected and categorized into one of five states:
- **IMPLEMENTED**: Fully working and meets target specification.
- **PARTIALLY IMPLEMENTED**: Basic structure exists but needs extension for EPS05.
- **MISSING**: Required for EPS05 but does not exist in the codebase.
- **BROKEN**: Exists but fails or throws errors during execution.
- **UNSAFE TO MODIFY**: Core architectural base (e.g. FastAPI app routing, core DB connection) that must be preserved without breaking current API contracts.

### Audit Matrix

| System Component | Existing Path(s) | Status | Audit Findings & Required Work |
| :--- | :--- | :--- | :--- |
| **FastAPI Core & Routing** | `app/main.py`, `app/config.py` | **UNSAFE TO MODIFY** | Core server setup, CORS, static mounts, error handling. Must extend without breaking existing routes. |
| **MongoDB Storage & Schema** | `app/db/mongo.py` | **PARTIALLY IMPLEMENTED** | Collections (`cameras`, `detections`, `tracks`, `events`, `alerts`, `chat_messages`, `videos`, `vlm_frames`) exist. Missing `evidence`, `identities`, `identity_observations`, `conversations`, `memory`, `evaluation_queries`, `evaluation_results` schemas & non-blocking indexes. |
| **Video Registry & Ingestion** | `app/routers/videos.py` | **PARTIALLY IMPLEMENTED** | Clips listing and file upload exist. Missing structured video registration, status tracking API (`/api/videos/{video_id}/status`), background job management, and metadata persistence (`videos` collection). |
| **Video Timestamp Engine** | `object_detection.py`, `app/services/video_probe.py` | **PARTIALLY IMPLEMENTED** | Computes FPS and frame counts. Needs explicit `timestamp_seconds` and `timestamp_formatted` (e.g. `00:42`) calculated per sampled frame relative to original video. |
| **YOLO Object Detection** | `object_detection.py`, `app/services/detection_runner.py` | **PARTIALLY IMPLEMENTED** | Ultralytics YOLO & BoT-SORT implemented. Needs standardized class filtering (`person`, `car`, `bus`, `truck`, `bicycle`, `motorcycle`, `bag`) and background asynchronous job integration. |
| **Evidence Generation** | `app/services/frame_store.py` | **PARTIALLY IMPLEMENTED** | Saves raw snapshots. Missing dedicated evidence frame generator creating bbox overlays, crop images, and storing records in `evidence` collection & `data/evidence/{camera_id}/{video_id}/`. |
| **Original Video Seek & Stream** | `app/routers/videos.py` | **PARTIALLY IMPLEMENTED** | Video streaming exists. Needs seek API (`/api/videos/{video_id}/seek?timestamp=42.0`) returning exact video timestamp offset for frontend player. |
| **CLIP / Visual Embedding** | `app/services/sem_embedder.py`, `app/services/sem_indexer.py`, `app/services/sem_search.py` | **IMPLEMENTED** | OpenCLIP + FAISS vector indexing present. Needs rebuildable vector metadata structure and integration into unified candidate retrieval. |
| **Natural Language Query Parser** | `app/services/nl_parser.py`, `app/routers/chat.py` | **PARTIALLY IMPLEMENTED** | LLM parsing (OpenAI/OpenRouter/Ollama) with regex fallback exists. Needs extension for camera names, attributes, zones, action/event, temporal/spatial operators, count constraints, identity references. |
| **Hybrid Retrieval & Reranking** | `app/services/unified_retrieval.py`, `app/services/result_merger.py` | **PARTIALLY IMPLEMENTED** | Structured + semantic fusion present. Needs strict evidence verification step and unified candidate result schema (`result_id`, `camera_id`, `video_id`, `timestamp_seconds`, `evidence_url`, etc.). |
| **Clarification-Once Memory & Entity Resolution** | `app/routers/chat.py` | **MISSING** | Needs `backend/app/services/memory_service.py` to persist conversation state (`conversations`, `memory`) and resolve references ("he", "the car", "that person") across turns. |
| **Intra-Camera Tracking** | `object_detection.py` | **PARTIALLY IMPLEMENTED** | BoT-SORT tracks stored in `tracks` collection. Needs track ID association with timestamp ranges and frame detections. |
| **Cross-Camera Person Re-ID** | `app/services/person_store.py`, `app/services/attribute_encoder.py` | **PARTIALLY IMPLEMENTED** | SigLIP + attribute FAISS index exists. Needs multi-camera matching logic combining visual similarity, time plausibility, and camera topology. |
| **Camera Topology** | None | **MISSING** | Needs topology registry (`source_camera`, `destination_camera`, `min_travel_time`, `max_travel_time`) to filter impossible cross-camera transitions. |
| **Journey Reconstruction** | None | **MISSING** | Needs API `GET /api/identities/{identity_id}/journey` returning chronologically ordered multi-camera observations. |
| **Temporal & Spatial Reasoning** | `app/services/retrieval_utils.py` | **PARTIALLY IMPLEMENTED** | Basic time window filters exist. Needs formal operator implementation (BEFORE, AFTER, DURING, NEAR, NEXT, PREVIOUS, WITHIN, BETWEEN, SAME_ENTITY). |
| **Alert Engine** | `app/services/alert_engine.py`, `app/routers/alerts.py` | **IMPLEMENTED** | Rule-based engine with zone and object checks. Needs grounding on recorded video events and severity levels. |
| **Privacy Mode (Face Blurring)** | None | **MISSING** | Needs face detection/blurring utility for evidence image display without overwriting original raw evidence frames. |
| **Evaluation & Benchmark Framework** | None | **MISSING** | Needs `backend/evaluation/` with benchmark queries measuring Top-1/Top-5 accuracy, camera localization, timestamp error, evidence accuracy, Re-ID accuracy, and query latency. |
| **Baseline vs Proposed System** | `app/services/unified_retrieval.py` | **PARTIALLY IMPLEMENTED** | Needs explicit comparative flags allowing single-call switching between Baseline (YOLO + structured filters) and Proposed (NL + CLIP + Hybrid Reranking + Memory + Temporal + Re-ID). |
| **System Status & Model Manager** | `app/services/model_loader.py` | **PARTIALLY IMPLEMENTED** | Centralized model path config present. Needs `GET /api/system/status` and `GET /api/system/models` endpoints detailing live system state. |

---

## 3. Specification of Missing Features

Below is the detailed specification of work required for each missing/partially implemented subsystem.

### 3.1 Video Registry & Ingestion Pipeline
- **Existing File to Extend:** `backend/app/routers/videos.py`
- **New Files Required:** `backend/app/services/video_ingestion.py`
- **APIs Required:**
  - `POST /api/videos/register`
  - `POST /api/videos/upload`
  - `GET /api/videos`
  - `GET /api/videos/{video_id}`
  - `GET /api/videos/{video_id}/status`
  - `POST /api/videos/{video_id}/process`
  - `POST /api/videos/{video_id}/stop`
  - `DELETE /api/videos/{video_id}`
  - `GET /api/videos/{video_id}/seek`
- **Database Schema:** Collection `videos` (`video_id`, `camera_id`, `camera_name`, `file_path`, `filename`, `fps`, `frame_count`, `duration_seconds`, `width`, `height`, `start_time`, `processing_status`, `processing_progress`, `created_at`).
- **Dependencies Required:** `cv2` (OpenCV), `pymongo`, `fastapi`.

### 3.2 Timestamped Frame Extraction & Detection Engine
- **Existing File to Extend:** `backend/object_detection.py`
- **New Files Required:** None (extend existing pipeline).
- **APIs Required:** Triggered via video processing APIs.
- **Database Schema:** Collection `detections` (`detection_id`, `video_id`, `camera_id`, `camera_name`, `frame_number`, `timestamp_seconds`, `timestamp_formatted`, `object_class`, `confidence`, `bbox`, `evidence_path`, `crop_path`, `created_at`).
- **Dependencies Required:** `ultralytics`, `opencv-python`.

### 3.3 Evidence Frame & Crop Generation
- **Existing File to Extend:** `backend/app/services/frame_store.py`
- **New Files Required:** `backend/app/services/evidence_service.py`
- **APIs Required:** Static media routing under `/media/evidence/`.
- **Database Schema:** Collection `evidence` (`evidence_id`, `video_id`, `camera_id`, `detection_id`, `timestamp_seconds`, `frame_number`, `image_path`, `crop_path`, `privacy_image_path`, `created_at`).

### 3.4 Search & Unified EPS05 Schema
- **Existing File to Extend:** `backend/app/routers/chat.py`, `backend/app/services/unified_retrieval.py`
- **New Files Required:** `backend/app/routers/search.py`
- **APIs Required:** `POST /api/search/query`
- **Database Schema:** Standardized JSON result schema as specified in EPS05 guidelines.

### 3.5 Clarification-Once Memory & Entity Resolution
- **Existing File to Extend:** `backend/app/services/nl_parser.py`
- **New Files Required:** `backend/app/services/memory_service.py`
- **APIs Required:** `GET /api/conversations/{conversation_id}/memory`
- **Database Schema:** Collections `conversations`, `memory`.

### 3.6 Cross-Camera Re-ID & Journey Reconstruction
- **Existing File to Extend:** `backend/app/services/person_store.py`
- **New Files Required:** `backend/app/services/reid_service.py`, `backend/app/services/topology_service.py`, `backend/app/routers/identities.py`
- **APIs Required:** `GET /api/identities/{identity_id}/journey`, `GET /api/identities`
- **Database Schema:** Collections `identities`, `identity_observations`, `camera_topology`.

### 3.7 Temporal & Spatial Reasoning
- **Existing File to Extend:** `backend/app/services/retrieval_utils.py`
- **New Files Required:** `backend/app/services/reasoning_engine.py`

### 3.8 Evaluation & Baseline vs Proposed System
- **New Files Required:**
  - `backend/evaluation/benchmark_dataset.json`
  - `backend/evaluation/evaluator.py`
  - `backend/app/routers/evaluation.py`
- **APIs Required:**
  - `POST /api/evaluation/run`
  - `GET /api/evaluation/results`
- **Database Schema:** Collections `evaluation_queries`, `evaluation_results`.

### 3.9 System Status & Model Manager
- **Existing File to Extend:** `backend/app/services/model_loader.py`
- **New Files Required:** `backend/app/routers/system.py`
- **APIs Required:**
  - `GET /api/system/status`
  - `GET /api/system/models`

---

## 4. Preservation & Implementation Principles

1. **FastAPI & MongoDB Core**: Do not replace FastAPI or MongoDB. Maintain all existing API endpoints so frontend functionality remains unbroken.
2. **Reuse Existing ML Models**: Retain existing Ultralytics YOLO, OpenVINO, OpenCLIP, and SigLIP implementations.
3. **Graceful Degradation**: If an AI model or vector index is missing or disabled, search must cleanly fall back to MongoDB structured queries.
4. **No Hallucinations**: Search results must be strictly grounded in actual MongoDB detections and saved evidence files.

---

## 5. Implementation Roadmap Overview

- **PHASE A:** Audit (Completed with this document)
- **PHASE B:** Video Registry & Ingestion Engine (`videos` router & service)
- **PHASE C & D:** Timestamped Frame Processing & YOLO Detection
- **PHASE E & F:** MongoDB Event Storage & Evidence Frame/Crop Generation
- **PHASE G:** Original Video Retrieval & Timestamp Seek API
- **PHASE H:** CLIP Embedding Engine & FAISS Vector Indexing
- **PHASE I & J:** Natural Language Query Engine & Unified Hybrid Retrieval
- **PHASE K & L:** Result Schema Standardization & Clarification-Once Memory
- **PHASE M, N, O, P, Q:** Entity Resolution, Tracking, Cross-Camera Re-ID, Topology & Journey Reconstruction
- **PHASE R:** Temporal & Spatial Reasoning Engine
- **PHASE S & T:** Alert Engine Extensions & Privacy Mode (Face Blurring)
- **PHASE U & V:** Evaluation Framework & Baseline vs Proposed System
- **PHASE W & X:** Latency Benchmarking, End-to-End Testing, System Status & Documentation

