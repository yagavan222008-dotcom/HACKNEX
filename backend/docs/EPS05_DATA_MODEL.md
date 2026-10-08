# EPS05 Data Model & Database Documentation

**Database:** MongoDB  
**Database Name:** `ai_surveillance`  

---

## MongoDB Collections Overview

| Collection | Description | Primary Indexes |
| :--- | :--- | :--- |
| `videos` | CCTV recording segment manifests | `video_id` (unique), `camera_id` |
| `detections` | Low-level object observations with timestamps | `camera_id`, `video_id`, `timestamp_seconds`, `object_class` |
| `events` | High-level detection & zone activity events | `camera_id`, `video_id`, `timestamp_seconds`, `event_type` |
| `evidence` | Evidence frames & crop image records | `evidence_id` (unique), `video_id`, `camera_id`, `timestamp_seconds` |
| `identities` | Real-world tracked identity entities across cameras | `identity_id` (unique) |
| `identity_observations` | Multi-camera observations associated with identities | `identity_id`, `camera_id`, `timestamp_seconds` |
| `conversations` | Session-level conversational histories | `conversation_id` (unique) |
| `memory` | Grounded clarification memory turns | `conversation_id`, `created_at` |
| `camera_topology` | Multi-camera transition constraints | `source_camera`, `destination_camera` (unique) |
| `alerts` | Event-grounded notification rules | `enabled`, `rule.cameras` |
| `evaluation_queries` | Held-out benchmark dataset queries | `query_id` (unique) |
| `evaluation_results` | Historical benchmark evaluation runs | `eval_run_id` |
