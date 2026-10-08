# EPS05 Evaluation Documentation

**Framework:** Held-out benchmark dataset with automated quantitative metrics.

---

## Metrics Tracked

1. **Top-1 Retrieval Accuracy**: Percentage of queries where highest-ranked result matches ground-truth camera & object.
2. **Top-5 Retrieval Accuracy**: Percentage of queries where ground-truth camera & object appears within top 5 results.
3. **Camera Localization Accuracy**: Precision of camera identification.
4. **Mean Timestamp Error (sec)**: Average absolute error between retrieved timestamp and true event frame timestamp.
5. **Mean Query Latency (ms)**: Measured end-to-end response time.

---

## Baseline vs. Proposed System Evaluation

- **Baseline Mode**: YOLO object detection + MongoDB structured filtering.
- **Proposed Mode**: YOLO + CLIP embeddings + NL understanding + Reranking + Evidence Verification + Clarification Memory + Re-ID + Temporal Reasoning.

Trigger benchmark programmatically via API: `POST /api/evaluation/run`.
