"use client";

import React, { useState, useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import {
  Award,
  Play,
  BarChart3,
  Clock,
  CheckCircle2,
  AlertCircle,
  Activity,
  Zap,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { api } from "@/lib/api";

export default function EvaluationPage() {
  const [evalResults, setEvalResults] = useState<any>(null);
  const [evalHistory, setEvalHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function loadEvaluation() {
    setLoading(true);
    try {
      const history = await api.getEvaluationResults();
      setEvalHistory(history || []);
      if (history && history.length > 0) {
        setEvalResults(history[0]);
      }
    } catch (err) {
      console.error("Failed to load evaluation:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEvaluation();
  }, []);

  async function handleRunEvaluation() {
    setRunning(true);
    try {
      const res = await api.runEvaluation("PROPOSED");
      setEvalResults(res);
      loadEvaluation();
    } catch (err: any) {
      alert(`Evaluation failed: ${err?.message || err}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <AppShell>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="border-b border-[#1E231E] pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald-400" />
              <h1 className="text-xl font-bold text-white tracking-tight font-mono">
                Evaluation & Benchmarking Suite
              </h1>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Benchmark retrieval accuracy (Top-1, Top-5), camera localization precision, timestamp error, and system query latency.
            </p>
          </div>
          <button
            onClick={handleRunEvaluation}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-semibold text-xs transition-all shadow-md shadow-emerald-950/20 disabled:opacity-50"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{running ? "Running Evaluation Suite..." : "Execute Benchmark Suite"}</span>
          </button>
        </div>

        {/* Top KPIs */}
        {loading ? (
          <div className="p-12 text-center text-xs text-gray-500 font-mono">Loading evaluation benchmarks...</div>
        ) : !evalResults ? (
          <div className="p-12 text-center border border-dashed border-[#1E231E] rounded-xl bg-[#151815] font-mono text-xs text-gray-500">
            No evaluation runs found. Click 'Execute Benchmark Suite' above to run test queries.
          </div>
        ) : (
          <div className="space-y-6 font-mono">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-xl border border-[#1E231E] bg-[#151815] p-5">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                  <span>Top-1 Retrieval Accuracy</span>
                  <Award className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {((evalResults.top1_accuracy ?? 0) * 100).toFixed(1)}%
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Exact query match rate</p>
              </div>

              <div className="rounded-xl border border-[#1E231E] bg-[#151815] p-5">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                  <span>Top-5 Accuracy</span>
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-emerald-400">
                  {((evalResults.top5_accuracy ?? 0) * 100).toFixed(1)}%
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Recall @ 5 candidates</p>
              </div>

              <div className="rounded-xl border border-[#1E231E] bg-[#151815] p-5">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                  <span>Camera Localization</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-white">
                  {((evalResults.camera_localization_accuracy ?? 0) * 100).toFixed(1)}%
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Correct camera localized</p>
              </div>

              <div className="rounded-xl border border-[#1E231E] bg-[#151815] p-5">
                <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                  <span>Mean Latency</span>
                  <Zap className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl font-bold text-emerald-400">
                  {Math.round(evalResults.mean_query_latency_ms ?? 0)} ms
                </div>
                <p className="text-[10px] text-gray-500 mt-1">End-to-end query time</p>
              </div>
            </div>

            {/* Test Queries Table */}
            <div className="rounded-xl border border-[#1E231E] bg-[#151815] p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Benchmark Query Results ({evalResults.details?.length || 0} Test Queries)
                </h3>
                <span className="text-xs text-gray-500">Run ID: {evalResults.eval_run_id}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-[#1E231E] text-gray-400 font-semibold">
                      <th className="py-2.5 px-3">Test Query</th>
                      <th className="py-2.5 px-3">Expected Cam</th>
                      <th className="py-2.5 px-3">Returned Cam</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1E231E]">
                    {evalResults.details?.map((item: any, i: number) => (
                      <tr key={i} className="hover:bg-[#101210]/50 transition-colors">
                        <td className="py-2.5 px-3 text-white font-medium">{item.query}</td>
                        <td className="py-2.5 px-3 text-gray-400">{item.expected_camera}</td>
                        <td className="py-2.5 px-3 text-gray-300">{item.returned_camera || "N/A"}</td>
                        <td className="py-2.5 px-3">
                          {item.top1_match ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                              PASS
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                              FAIL
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right text-gray-400 font-mono">
                          {Math.round(item.latency_ms ?? 0)} ms
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
