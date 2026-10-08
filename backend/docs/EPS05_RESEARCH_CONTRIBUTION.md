# EPS05 Research Contribution Documentation

**Title:** Multi-Stream Video Intelligence with Conversational Query Grounding  
**Problem Statement:** EPS05 (HACKNEX 2026)  

---

## Key Technical Contributions

1. **Clarification-Once Conversational Memory**: Grounding entity selection ("he", "that car", "previous result") across turns while persisting state in MongoDB to avoid ambiguous hallucinations.
2. **Topology-Grounded Cross-Camera Re-ID**: Combining visual appearance embeddings (SigLIP/CLIP) with camera topology transition windows (`min_travel_seconds`, `max_travel_seconds`) to eliminate spatial-temporal impossibilities.
3. **Factual Evidence Verification Engine**: Filtering candidate retrievals against ground truth vision detections and bounding boxes before presenting surveillance evidence.
4. **Empirical Held-out Evaluation Suite**: Quantitative benchmarking measuring Top-1/Top-5 accuracy, camera localization accuracy, mean timestamp error (seconds), and query latency (ms).
