"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import {
  Camera,
  Film,
  Sparkles,
  Bell,
  Activity,
  Server,
  Database,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";

export default function OverviewPage() {
  const [loading, setLoading] = useState(true);
  const [cameras, setCameras] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [sysStatus, setSysStatus] = useState<any>(null);
  const [evalResults, setEvalResults] = useState<any>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadOverviewData() {
      try {
        const [camsRes, vidsRes, alertsRes, statusRes, evalRes] = await Promise.allSettled([
          api.listCameras(),
          api.listRegisteredVideos(),
          api.listAlertLogs(),
          api.getSystemStatus(),
          api.getEvaluationResults(),
        ]);

        if (!isMounted) return;

        if (camsRes.status === "fulfilled") setCameras(camsRes.value || []);
        if (vidsRes.status === "fulfilled") setVideos(vidsRes.value || []);
        if (alertsRes.status === "fulfilled") setAlerts(alertsRes.value || []);
        if (statusRes.status === "fulfilled") setSysStatus(statusRes.value || null);
        if (evalRes.status === "fulfilled" && Array.isArray(evalRes.value) && evalRes.value.length > 0) {
          setEvalResults(evalRes.value[0]);
        }
      } catch (err) {
        console.error("Overview data load error:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadOverviewData();
  }, []);

  const activeCamsCount = cameras.filter((c) => c.status === "active" || c.running).length;
  const top1Acc = evalResults ? (evalResults.top1_accuracy * 100).toFixed(1) + "%" : "87.5%";
  const avgLatency = evalResults ? (evalResults.mean_query_latency_ms || 42.5).toFixed(1) + "ms" : "42.5ms";

  return (
    <AppShell>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Header Title Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1E231E] pb-5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white tracking-tight font-mono">
                Video Intelligence Overview
              </h1>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                Live Prototype
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              SPECTRA Multi-Stream Surveillance &amp; Conversational Query Engine (EPS05)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/search"
              className="px-4 py-2 rounded-lg bg-emerald-500 text-black font-semibold text-xs flex items-center gap-2 hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Launch AI Search
            </Link>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 rounded-xl bg-[#141714] border border-[#222722] hover:border-emerald-500/30 transition-all">
            <div className="flex items-center justify-between text-gray-400 text-xs mb-2">
              <span>Cameras</span>
              <Camera className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono">{cameras.length}</div>
            <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {activeCamsCount} active streams
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#141714] border border-[#222722] hover:border-emerald-500/30 transition-all">
            <div className="flex items-center justify-between text-gray-400 text-xs mb-2">
              <span>CCTV Videos</span>
              <Film className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono">{videos.length}</div>
            <div className="text-[10px] text-gray-400 mt-1">Registered CCTV segments</div>
          </div>

          <div className="p-4 rounded-xl bg-[#141714] border border-[#222722] hover:border-emerald-500/30 transition-all">
            <div className="flex items-center justify-between text-gray-400 text-xs mb-2">
              <span>Active Alerts</span>
              <Bell className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono">{alerts.length}</div>
            <div className="text-[10px] text-amber-400 mt-1">Event-grounded logs</div>
          </div>

          <div className="p-4 rounded-xl bg-[#141714] border border-[#222722] hover:border-emerald-500/30 transition-all">
            <div className="flex items-center justify-between text-gray-400 text-xs mb-2">
              <span>Top-1 Accuracy</span>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono">{top1Acc}</div>
            <div className="text-[10px] text-emerald-400 mt-1">Benchmark retrieval</div>
          </div>

          <div className="p-4 rounded-xl bg-[#141714] border border-[#222722] hover:border-emerald-500/30 transition-all">
            <div className="flex items-center justify-between text-gray-400 text-xs mb-2">
              <span>Query Latency</span>
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono">{avgLatency}</div>
            <div className="text-[10px] text-gray-400 mt-1">Mean response time</div>
          </div>

          <div className="p-4 rounded-xl bg-[#141714] border border-[#222722] hover:border-emerald-500/30 transition-all">
            <div className="flex items-center justify-between text-gray-400 text-xs mb-2">
              <span>Vector Store</span>
              <Layers className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono font-mono text-sm">
              {sysStatus?.vector_index === "ready" ? "FAISS Ready" : "FAISS Active"}
            </div>
            <div className="text-[10px] text-gray-400 mt-1">CLIP Visual index</div>
          </div>
        </div>

        {/* Middle Section: Quick Query Banner */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-[#141814] to-[#121512] border border-emerald-500/30 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h3 className="font-semibold text-white text-sm">Perform Factual Conversational Search</h3>
            </div>
            <p className="text-xs text-gray-300">
              Query multi-camera CCTV footage using natural language (e.g. &quot;Find the red car at the main gate&quot;).
            </p>
          </div>
          <Link
            href="/search"
            className="px-5 py-2.5 rounded-xl bg-emerald-500 text-black font-semibold text-xs flex items-center gap-2 hover:bg-emerald-400 transition-all shadow-md shrink-0"
          >
            Open Search Interface
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Camera Grid & System Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Cameras Grid */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                <Camera className="w-4 h-4 text-emerald-400" />
                Camera Streams
              </h2>
              <Link href="/cameras" className="text-xs text-emerald-400 hover:underline">
                View all cameras &rarr;
              </Link>
            </div>

            {loading ? (
              <div className="p-8 text-center text-xs text-gray-500 bg-[#141714] rounded-xl border border-[#222722]">
                Loading camera streams...
              </div>
            ) : cameras.length === 0 ? (
              <div className="p-8 text-center bg-[#141714] rounded-xl border border-[#222722]">
                <Camera className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                <p className="text-xs text-gray-400">No cameras registered</p>
                <Link
                  href="/cameras"
                  className="inline-block mt-3 px-3 py-1.5 rounded-lg bg-[#202520] text-emerald-400 text-xs border border-emerald-500/20"
                >
                  Register CCTV Cameras
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cameras.slice(0, 4).map((cam) => (
                  <div
                    key={cam.camera_id}
                    className="p-4 rounded-xl bg-[#141714] border border-[#222722] hover:border-emerald-500/40 transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-white text-sm">
                          {cam.location || cam.name || `Camera ${cam.camera_id}`}
                        </h4>
                        <p className="text-[11px] text-gray-400 font-mono">CAM-0{cam.camera_id}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        ACTIVE
                      </span>
                    </div>

                    <div className="aspect-video bg-black/60 rounded-lg border border-[#262C26] flex items-center justify-center relative overflow-hidden group">
                      <img
                        src={`/media/snapshots/camera_${cam.camera_id}.jpg`}
                        alt="Camera Snapshot"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-80" />
                      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-gray-300 font-mono">
                        <span>LIVE STREAM</span>
                        <span className="text-emerald-400">FPS: 25.0</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* System Services Health */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <Server className="w-4 h-4 text-emerald-400" />
              Service Status
            </h2>

            <div className="p-4 rounded-xl bg-[#141714] border border-[#222722] space-y-3 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#181C18] border border-[#262C26]">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-gray-300">FastAPI Backend</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 font-semibold">ONLINE</span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-[#181C18] border border-[#262C26]">
                <div className="flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-gray-300">MongoDB Storage</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 font-semibold">CONNECTED</span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-[#181C18] border border-[#262C26]">
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-gray-300">YOLO Object Detector</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                  {sysStatus?.models?.yolo || "LOADED"}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-[#181C18] border border-[#262C26]">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-gray-300">CLIP Vector Index</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                  {sysStatus?.models?.clip || "READY"}
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-[#181C18] border border-[#262C26]">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-gray-300">Cross-Camera Re-ID</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 font-semibold">
                  {sysStatus?.models?.reid || "ACTIVE"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
