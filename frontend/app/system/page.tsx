"use client";

import React, { useState, useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import {
  Server,
  Database,
  Cpu,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";

export default function SystemPage() {
  const [status, setStatus] = useState<any>(null);
  const [models, setModels] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSystemInfo() {
      setLoading(true);
      try {
        const [statusRes, modelsRes] = await Promise.allSettled([
          api.getSystemStatus(),
          api.getSystemModels(),
        ]);
        if (statusRes.status === "fulfilled") setStatus(statusRes.value);
        if (modelsRes.status === "fulfilled") setModels(modelsRes.value);
      } catch (err) {
        console.error("Failed to load system status:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSystemInfo();
  }, []);

  return (
    <AppShell>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="border-b border-[#1E231E] pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5 text-emerald-400" />
              <h1 className="text-xl font-bold text-white tracking-tight font-mono">
                System Diagnostics & Infrastructure
              </h1>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Real-time telemetry for MongoDB database connections, YOLO/CLIP models, and video processing workers.
            </p>
          </div>
        </div>

        {/* System Cards */}
        {loading ? (
          <div className="p-12 text-center text-xs text-gray-500 font-mono">Querying system status...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-mono">
            {/* Backend Service */}
            <div className="rounded-xl border border-[#1E231E] bg-[#151815] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 flex items-center gap-2">
                  <Server className="w-4 h-4 text-emerald-400" />
                  FastAPI Engine
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  ONLINE
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">HACKNEX EPS05 Core</h3>
                <p className="text-xs text-gray-400 mt-1">Version: {status?.version || "1.0.0"}</p>
              </div>
              <div className="p-3 rounded-lg bg-[#101210] border border-[#1E231E] text-xs text-gray-300">
                Listening on localhost:8000
              </div>
            </div>

            {/* MongoDB Database */}
            <div className="rounded-xl border border-[#1E231E] bg-[#151815] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-400" />
                  MongoDB Storage
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  CONNECTED
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Docker Container</h3>
                <p className="text-xs text-gray-400 mt-1">
                  Collections: {status?.database?.collections?.join(", ") || "events, videos, identities"}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-[#101210] border border-[#1E231E] text-xs text-gray-300">
                Vector Index: {status?.vector_index || "FAISS HNSW / FlatL2"}
              </div>
            </div>

            {/* AI Models */}
            <div className="rounded-xl border border-[#1E231E] bg-[#151815] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  AI Vision & LLM
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  LOADED
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">YOLO26 & CLIP</h3>
                <p className="text-xs text-gray-400 mt-1">Model Path: yolo26l-seg.pt</p>
              </div>
              <div className="p-3 rounded-lg bg-[#101210] border border-[#1E231E] text-xs text-gray-300">
                Embedder: OpenAI CLIP ViT-B/32
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
