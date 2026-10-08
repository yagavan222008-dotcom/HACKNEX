from __future__ import annotations

import os
import json
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from loguru import logger

from backend.app.db.mongo import evaluation_queries as eval_q_col, evaluation_results as eval_r_col
from backend.app.services.unified_retrieval import UnifiedRetrieval
from backend.app.services.nl_parser import parse_nl_with_llm, parse_simple_nl_to_filter

BENCHMARK_PATH = Path(__file__).parent / "benchmark_dataset.json"


def load_benchmark_dataset() -> List[Dict[str, Any]]:
    """Load held-out evaluation query dataset."""
    if not BENCHMARK_PATH.exists():
        return []
    try:
        with open(BENCHMARK_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error("Failed to load benchmark dataset: {}", e)
        return []


def run_evaluation_benchmark(mode: str = "PROPOSED") -> Dict[str, Any]:
    """
    Run evaluation benchmark suite against held-out query dataset.
    Supports mode='BASELINE' vs mode='PROPOSED'.
    Returns structured metrics (Top-1, Top-5, Camera Localization, Timestamp Error, Latency).
    """
    dataset = load_benchmark_dataset()
    if not dataset:
        return {
            "eval_run_id": f"eval_{int(time.time())}",
            "mode": mode,
            "status": "error",
            "message": "Benchmark dataset empty or missing.",
        }

    eval_run_id = f"eval_{mode.lower()}_{int(time.time())}"
    retrieval = UnifiedRetrieval()

    total_queries = len(dataset)
    top1_hits = 0
    top5_hits = 0
    cam_hits = 0
    timestamp_errors = []
    latencies = []

    results_detail = []

    for item in dataset:
        query_id = item.get("query_id")
        query_text = item["query"]
        exp_cam = item.get("expected_camera")
        exp_obj = item.get("expected_object")
        exp_ts = item.get("expected_timestamp")

        t0 = time.perf_counter()

        # Parse query
        if mode == "PROPOSED":
            try:
                parsed = parse_nl_with_llm(query_text)
            except Exception:
                parsed = parse_simple_nl_to_filter(query_text)
        else:
            # Baseline mode using regex parser only
            parsed = parse_simple_nl_to_filter(query_text)

        # Retrieve candidates
        res = retrieval.search(parsed_filter=parsed, semantic_query=query_text, limit=10)
        t1 = time.perf_counter()
        latency_ms = round((t1 - t0) * 1000.0, 2)
        latencies.append(latency_ms)

        candidates = res.get("results") or []

        top1_correct = False
        top5_correct = False
        cam_correct = False
        ts_err = None

        if candidates:
            # Evaluate Top-1
            first = candidates[0]
            cand_cam = str(first.get("camera_id") or "")
            cand_obj = str(first.get("object_class") or "")
            cand_ts = float(first.get("timestamp_seconds") or 0.0)

            if exp_cam and str(exp_cam).lower() == cand_cam.lower():
                cam_correct = True

            if exp_obj and str(exp_obj).lower() in cand_obj.lower():
                if cam_correct:
                    top1_correct = True

            if exp_ts is not None:
                ts_err = abs(cand_ts - float(exp_ts))
                timestamp_errors.append(ts_err)

            # Evaluate Top-5
            for cand in candidates[:5]:
                c_cam = str(cand.get("camera_id") or "")
                c_obj = str(cand.get("object_class") or "")
                if exp_cam and exp_obj:
                    if exp_cam.lower() == c_cam.lower() and exp_obj.lower() in c_obj.lower():
                        top5_correct = True
                        break

        if top1_correct:
            top1_hits += 1
        if top5_correct:
            top5_hits += 1
        if cam_correct:
            cam_hits += 1

        detail_record = {
            "query_id": query_id,
            "query": query_text,
            "latency_ms": latency_ms,
            "top1_correct": top1_correct,
            "top5_correct": top5_correct,
            "camera_correct": cam_correct,
            "timestamp_error_sec": ts_err,
        }
        results_detail.append(detail_record)

    avg_latency = round(sum(latencies) / len(latencies), 2) if latencies else 0.0
    avg_ts_err = round(sum(timestamp_errors) / len(timestamp_errors), 2) if timestamp_errors else 0.0

    summary = {
        "eval_run_id": eval_run_id,
        "mode": mode,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_queries": total_queries,
        "top1_accuracy": round(top1_hits / total_queries, 4),
        "top5_accuracy": round(top5_hits / total_queries, 4),
        "camera_localization_accuracy": round(cam_hits / total_queries, 4),
        "mean_timestamp_error_sec": avg_ts_err,
        "mean_query_latency_ms": avg_latency,
        "details": results_detail,
    }

    try:
        eval_r_col.update_one({"eval_run_id": eval_run_id}, {"$set": summary}, upsert=True)
    except Exception as e:
        logger.warning("Failed to store evaluation results in MongoDB: {}", e)

    return summary
