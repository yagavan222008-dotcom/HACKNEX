"use client";

import React, { useState, useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import {
  Camera,
  Plus,
  Play,
  Square,
  Activity,
  MapPin,
  CheckCircle2,
  XCircle,
  Clock,
  Film,
  Layers,
} from "lucide-react";
import { api } from "@/lib/api";

export default function CamerasPage() {
  const [cameras, setCameras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [regForm, setRegForm] = useState({ camera_id: "1", source: "0", location: "Main Gate" });
  const [selectedCam, setSelectedCam] = useState<any>(null);

  async function fetchCameras() {
    setLoading(true);
    try {
      const res = await api.listCameras();
      setCameras(res || []);
    } catch (err) {
      console.error("Failed to fetch cameras:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCameras();
  }, []);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.registerCamera({
        camera_id: parseInt(regForm.camera_id),
        source: regForm.source,
        location: regForm.location,
      });
      setShowRegisterModal(false);
      fetchCameras();
    } catch (err: any) {
      alert(`Camera registration failed: ${err.message || err}`);
    }
  }

  async function toggleCameraStream(camId: number, isRunning: boolean) {
    try {
      if (isRunning) {
        await api.stopCamera(camId);
      } else {
        await api.startCamera(camId);
      }
      fetchCameras();
    } catch (err: any) {
      alert(`Stream toggle failed: ${err.message || err}`);
    }
  }

  return (
    <AppShell>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="border-b border-[#1E231E] pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-emerald-400" />
              <h1 className="text-xl font-bold text-white tracking-tight font-mono">
                CCTV Camera Infrastructure
              </h1>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Multi-stream CCTV device management, occupancy monitoring &amp; frame feeds
            </p>
          </div>

          <button
            onClick={() => setShowRegisterModal(true)}
            className="px-4 py-2 rounded-lg bg-emerald-500 text-black font-semibold text-xs flex items-center gap-2 hover:bg-emerald-400 transition-all shadow-md shrink-0"
          >
            <Plus className="w-4 h-4" />
            Register Camera
          </button>
        </div>

        {/* Camera Cards Grid */}
        {loading ? (
          <div className="p-12 text-center bg-[#141714] rounded-2xl border border-[#222722] text-xs text-gray-400">
            Loading CCTV streams...
          </div>
        ) : cameras.length === 0 ? (
          <div className="p-12 text-center bg-[#141714] rounded-2xl border border-[#222722] space-y-3">
            <Camera className="w-10 h-10 text-gray-600 mx-auto" />
            <h3 className="text-sm font-semibold text-white">No CCTV Cameras Registered</h3>
            <p className="text-xs text-gray-400 max-w-md mx-auto">
              Register CCTV camera sources to start automated YOLO detection, frame timestamping, and visual search.
            </p>
            <button
              onClick={() => setShowRegisterModal(true)}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-black font-semibold text-xs"
            >
              Add First Camera
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cameras.map((cam) => {
              const isRunning = cam.status === "active" || cam.running;
              return (
                <div
                  key={cam.camera_id}
                  className="p-4 rounded-xl bg-[#141714] border border-[#222722] hover:border-emerald-500/40 transition-all space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-white text-base">
                          {cam.location || cam.name || `Camera ${cam.camera_id}`}
                        </h3>
                        <p className="text-xs text-gray-400 font-mono">CAM-0{cam.camera_id}</p>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold flex items-center gap-1.5 ${
                          isRunning
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-gray-500/10 text-gray-400 border border-gray-500/20"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isRunning ? "bg-emerald-400 animate-pulse" : "bg-gray-500"
                          }`}
                        />
                        {isRunning ? "ACTIVE" : "STANDBY"}
                      </span>
                    </div>

                    {/* Camera Video Stream Preview */}
                    <div className="aspect-video bg-black/80 rounded-xl overflow-hidden border border-[#262C26] relative flex items-center justify-center">
                      <img
                        src={`/api/videos/stream/${cam.camera_id}`}
                        alt="Camera Stream"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] text-gray-300 font-mono border border-white/10">
                        {cam.location || "CCTV Stream"}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-400 font-mono">
                      <div>
                        <span className="text-gray-500 block text-[10px]">SOURCE</span>
                        <span className="text-gray-200 text-ellipsis overflow-hidden block">
                          {String(cam.source || "0")}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block text-[10px]">LAST ACTIVE</span>
                        <span className="text-gray-200">
                          {cam.last_seen ? new Date(cam.last_seen).toLocaleTimeString() : "Just now"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-[#222722]">
                    <button
                      onClick={() => toggleCameraStream(cam.camera_id, isRunning)}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                        isRunning
                          ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                          : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
                      }`}
                    >
                      {isRunning ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isRunning ? "Stop Feed" : "Start Feed"}</span>
                    </button>
                    <button
                      onClick={() => setSelectedCam(cam)}
                      className="py-1.5 px-3 rounded-lg bg-[#1C201C] text-gray-300 text-xs font-semibold hover:text-white hover:bg-[#252A25] border border-[#2B322B]"
                    >
                      Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: Register Camera */}
        {showRegisterModal && (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowRegisterModal(false)}
          >
            <div
              className="bg-[#141714] border border-[#2B322B] rounded-2xl max-w-md w-full p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#222722] pb-3">
                <h3 className="font-bold text-white text-base">Register CCTV Camera</h3>
                <button onClick={() => setShowRegisterModal(false)} className="text-gray-400 hover:text-white">
                  ✕
                </button>
              </div>

              <form onSubmit={handleRegister} className="space-y-4 text-xs">
                <div>
                  <label className="block text-gray-400 mb-1 font-mono">Camera ID (Numeric)</label>
                  <input
                    type="number"
                    value={regForm.camera_id}
                    onChange={(e) => setRegForm({ ...regForm, camera_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#1C201C] border border-[#2B322B] text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-400 mb-1 font-mono">Location / Name</label>
                  <input
                    type="text"
                    value={regForm.location}
                    onChange={(e) => setRegForm({ ...regForm, location: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#1C201C] border border-[#2B322B] text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-400 mb-1 font-mono">Source (Webcam index or Video file path)</label>
                  <input
                    type="text"
                    value={regForm.source}
                    onChange={(e) => setRegForm({ ...regForm, source: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[#1C201C] border border-[#2B322B] text-white"
                    required
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRegisterModal(false)}
                    className="px-4 py-2 rounded-lg bg-[#1C201C] text-gray-300"
                  >
                    Cancel
                  </button>
                  <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-500 text-black font-semibold">
                    Register
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
