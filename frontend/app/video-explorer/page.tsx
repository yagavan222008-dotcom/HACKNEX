"use client";

import React, { useState, useEffect, useRef } from "react";
import AppShell from "@/components/layout/AppShell";
import {
  Film,
  Upload,
  Play,
  Pause,
  Clock,
  Camera,
  CheckCircle2,
  AlertCircle,
  FileVideo,
  Layers,
  Sparkles,
  Plus,
  X,
  FileUp,
  Cpu,
  Search,
  Maximize2,
  RefreshCw,
  Eye,
} from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function VideoExplorerPage() {
  const [videos, setVideos] = useState<any[]>([]);
  const [cameras, setCameras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showStreamModal, setShowStreamModal] = useState(false);
  const [selectedVideoDetails, setSelectedVideoDetails] = useState<any | null>(null);

  // Upload Form State
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [cameraId, setCameraId] = useState("1");
  const [cameraName, setCameraName] = useState("Main Gate");
  const [videoName, setVideoName] = useState("");
  const [startTime, setStartTime] = useState("00:00:00");

  // Inline Camera Registration State
  const [showNewCamInputs, setShowNewCamInputs] = useState(false);
  const [newCamId, setNewCamId] = useState("");
  const [newCamLocation, setNewCamLocation] = useState("");

  // Upload Progress State
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [loadedBytes, setLoadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [uploadedVideoId, setUploadedVideoId] = useState<string | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  // Video Player Ref for seeking
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stream Ingest Form
  const [streamForm, setStreamForm] = useState({
    camera_id: "1",
    camera_name: "Main Gate",
    file_path: "data/videos/test_cam01.mp4",
    video_id: "",
    start_time: "00:00:00",
  });
  const [streamIngesting, setStreamIngesting] = useState(false);

  const searchParams = useSearchParams();
  const paramVideoId = searchParams?.get("video_id");
  const paramOffset = searchParams?.get("offset");

  async function loadData() {
    setLoading(true);
    try {
      const [vidsRes, camsRes] = await Promise.allSettled([
        api.listRegisteredVideos(),
        api.listCameras(),
      ]);

      if (vidsRes.status === "fulfilled") setVideos(vidsRes.value || []);
      if (camsRes.status === "fulfilled") {
        const camList = camsRes.value || [];
        setCameras(camList);
        if (camList.length > 0 && !cameraId) {
          setCameraId(String(camList[0].camera_id));
          setCameraName(camList[0].location || camList[0].name || `Camera ${camList[0].camera_id}`);
        }
      }
    } catch (err) {
      console.error("Failed to load video explorer data:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (paramVideoId) {
      api.getVideoDetails(paramVideoId)
        .then((vid) => {
          if (vid && vid.video_id) {
            setSelectedVideoDetails(vid);
          }
        })
        .catch((err) => console.error("Failed to auto-open video details:", err));
    }
  }, [paramVideoId]);

  const handleLoadedMetadata = () => {
    if (paramOffset && videoRef.current) {
      const sec = parseFloat(paramOffset);
      if (!isNaN(sec) && sec >= 0) {
        videoRef.current.currentTime = sec;
        videoRef.current.play().catch(() => {});
      }
    }
  };

  // Poll video status during background processing
  useEffect(() => {
    if (!uploadedVideoId || processingStatus === "completed" || processingStatus === "ready" || pipelineError) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await api.getVideoStatus(uploadedVideoId);
        if (res && res.processing_status) {
          setProcessingStatus(res.processing_status);
          if (res.processing_status === "completed" || res.processing_status === "ready") {
            loadData();
            clearInterval(interval);
          } else if (res.processing_status === "failed") {
            setPipelineError(res.error || "Video processing failed");
            clearInterval(interval);
          }
        }
      } catch (err) {
        // ignore polling transient error
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [uploadedVideoId, processingStatus, pipelineError]);

  // Handle Drag & Drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    setFileError(null);
    const validExts = [".mp4", ".avi", ".mov", ".mkv"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();

    if (!validExts.includes(ext)) {
      setFileError(`Unsupported video format (${ext}). Please upload MP4, AVI, MOV, or MKV.`);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    if (!videoName) {
      setVideoName(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  // Register new camera inline
  const handleRegisterNewCam = async () => {
    if (!newCamId || !newCamLocation) return;
    try {
      await api.registerCamera({
        camera_id: newCamId,
        source: "0",
        location: newCamLocation,
      });
      const updatedCams = await api.listCameras();
      setCameras(updatedCams || []);
      setCameraId(newCamId);
      setCameraName(newCamLocation);
      setShowNewCamInputs(false);
      setNewCamId("");
      setNewCamLocation("");
    } catch (err: any) {
      alert(`Camera registration failed: ${err.message || err}`);
    }
  };

  // Perform CCTV Upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setFileError("Please select a valid CCTV video file.");
      return;
    }

    setIsUploading(true);
    setUploadPct(0);
    setPipelineError(null);
    setProcessingStatus("uploading");

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("camera_id", cameraId);
    formData.append("camera_name", cameraName);
    formData.append("video_name", videoName || selectedFile.name);
    formData.append("start_time", startTime);

    try {
      const res = await api.uploadCctvVideo(formData, (pct, loaded, total) => {
        setUploadPct(pct);
        setLoadedBytes(loaded);
        setTotalBytes(total);
      });

      if (res && res.video_id) {
        setUploadedVideoId(res.video_id);
        setProcessingStatus("processing");
        loadData();
      } else {
        setProcessingStatus("ready");
        loadData();
      }
    } catch (err: any) {
      console.error("Upload error:", err);
      setPipelineError(err.message || "Failed to upload CCTV video");
      setProcessingStatus("failed");
    } finally {
      setIsUploading(false);
    }
  };

  // Ingest stream fallback
  const handleStreamIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    setStreamIngesting(true);
    try {
      const reg = await api.registerVideo({
        camera_id: streamForm.camera_id,
        camera_name: streamForm.camera_name,
        file_path: streamForm.file_path,
        video_id: streamForm.video_id || undefined,
        start_time: streamForm.start_time,
      });
      if (reg && reg.video_id) {
        await api.processVideo(reg.video_id);
      }
      setShowStreamModal(false);
      loadData();
    } catch (err: any) {
      alert(`Stream registration failed: ${err.message || err}`);
    } finally {
      setStreamIngesting(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <AppShell>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full font-mono">
        {/* Header */}
        <div className="border-b border-[#1E231E] pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Film className="w-5 h-5 text-emerald-400" />
              <h1 className="text-xl font-bold text-white tracking-tight font-mono">
                Multi-Stream Video Ingestion & Explorer
              </h1>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Add and analyze recorded CCTV footage across multi-camera feeds with YOLO11 and CLIP embeddings.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setSelectedFile(null);
                setFileError(null);
                setProcessingStatus(null);
                setUploadedVideoId(null);
                setPipelineError(null);
                setShowUploadModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold text-xs transition-all shadow-md shadow-emerald-950/20"
            >
              <Upload className="w-4 h-4" />
              <span>Upload CCTV Video</span>
            </button>

            <button
              onClick={() => setShowStreamModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#151815] border border-[#1E231E] hover:border-emerald-500/40 text-gray-300 hover:text-white text-xs transition-colors"
            >
              <Film className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ingest Stream</span>
            </button>
          </div>
        </div>

        {/* Video Cards Grid */}
        {loading ? (
          <div className="p-12 text-center text-xs text-gray-500 font-mono">Querying CCTV video index...</div>
        ) : videos.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-[#1E231E] rounded-xl bg-[#151815]">
            <FileVideo className="w-8 h-8 text-gray-600 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-gray-300">No CCTV Videos Registered</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto mt-1 mb-4">
              Upload recorded CCTV footage or register stream paths to extract keyframes, generate YOLO11 detections, and enable conversational AI search.
            </p>
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-4 py-2 rounded-lg bg-emerald-500 text-stone-950 text-xs font-bold hover:bg-emerald-400"
            >
              Upload CCTV Video
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map((vid: any) => (
              <div
                key={vid.video_id}
                className="rounded-xl border border-[#1E231E] bg-[#151815] p-5 flex flex-col justify-between hover:border-emerald-500/40 transition-colors shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {vid.camera_name || `Camera #${vid.camera_id}`}
                    </span>
                    <span className="text-[10px] font-mono text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gray-500" />
                      {vid.start_time || "00:00:00"}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-white font-mono truncate mb-1" title={vid.video_id}>
                    {vid.filename || vid.video_id}
                  </h3>
                  <p className="text-[11px] text-gray-500 font-mono truncate mb-4" title={vid.file_path}>
                    {vid.file_path}
                  </p>

                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-[#101210] border border-[#1E231E] text-xs font-mono mb-4">
                    <div>
                      <span className="text-[9px] text-gray-500 block">Detections</span>
                      <span className="text-xs font-bold text-emerald-400">
                        {vid.detection_count ?? vid.total_detections ?? 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-500 block">Indexed Frames</span>
                      <span className="text-xs font-bold text-gray-300">
                        {vid.frames_count ?? vid.frame_count ?? 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-500 block">Detector</span>
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                        YOLO11
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-3 border-t border-[#1E231E]">
                  <button
                    onClick={() => setSelectedVideoDetails(vid)}
                    className="text-xs font-mono text-gray-400 hover:text-white flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    <span>View Details</span>
                  </button>

                  <Link
                    href={`/search?video_id=${vid.video_id}&camera_id=${vid.camera_id}`}
                    className="text-xs font-mono text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    Query Footage →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── UPLOAD CCTV FOOTAGE MODAL ────────────────────────────────────── */}
        {showUploadModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#151815] border border-[#1E231E] rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-[#1E231E] pb-3">
                <div>
                  <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                    <Upload className="w-4 h-4 text-emerald-400" />
                    Upload CCTV Footage
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Add recorded multi-camera footage to the intelligence index.
                  </p>
                </div>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="text-gray-400 hover:text-white text-xs"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {!processingStatus || processingStatus === "uploading" ? (
                <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs font-mono">
                  {/* File Drag & Drop Zone */}
                  <div
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                      dragActive
                        ? "border-emerald-500 bg-emerald-500/10"
                        : selectedFile
                        ? "border-emerald-500/50 bg-[#101210]"
                        : "border-[#1E231E] hover:border-emerald-500/40 bg-[#101210]"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".mp4,.avi,.mov,.mkv"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          validateAndSetFile(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />

                    {selectedFile ? (
                      <div className="space-y-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                        <p className="text-sm font-bold text-white truncate">{selectedFile.name}</p>
                        <div className="flex items-center justify-center gap-2 text-[11px] text-gray-400">
                          <span>{formatBytes(selectedFile.size)}</span>
                          <span>•</span>
                          <span className="uppercase text-emerald-400 font-bold">
                            {selectedFile.name.split(".").pop()}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFile(null);
                          }}
                          className="text-rose-400 hover:underline text-[11px] pt-1"
                        >
                          Remove file
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <FileUp className="w-8 h-8 text-emerald-400 mx-auto opacity-80" />
                        <p className="text-sm font-semibold text-gray-300">
                          Drag & drop your CCTV video here
                        </p>
                        <p className="text-[11px] text-gray-500">
                          or browse from your computer
                        </p>
                        <span className="inline-block text-[10px] px-2.5 py-1 rounded bg-[#151815] text-gray-400 border border-[#1E231E] mt-2">
                          MP4 • AVI • MOV • MKV
                        </span>
                      </div>
                    )}
                  </div>

                  {fileError && (
                    <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{fileError}</span>
                    </div>
                  )}

                  {/* Camera Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-gray-400">Camera / Location</label>
                      <button
                        type="button"
                        onClick={() => setShowNewCamInputs(!showNewCamInputs)}
                        className="text-emerald-400 hover:underline text-[11px] flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Register New Camera</span>
                      </button>
                    </div>

                    {showNewCamInputs ? (
                      <div className="p-3 rounded-lg bg-[#101210] border border-[#1E231E] space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Camera ID (e.g. 4)"
                            value={newCamId}
                            onChange={(e) => setNewCamId(e.target.value)}
                            className="bg-[#151815] border border-[#1E231E] rounded px-2.5 py-1.5 text-white"
                          />
                          <input
                            type="text"
                            placeholder="Location Name"
                            value={newCamLocation}
                            onChange={(e) => setNewCamLocation(e.target.value)}
                            className="bg-[#151815] border border-[#1E231E] rounded px-2.5 py-1.5 text-white"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleRegisterNewCam}
                          className="w-full py-1 bg-emerald-500 text-stone-950 font-bold rounded text-[11px]"
                        >
                          Save Camera
                        </button>
                      </div>
                    ) : (
                      <select
                        value={cameraId}
                        onChange={(e) => {
                          setCameraId(e.target.value);
                          const matched = cameras.find((c) => String(c.camera_id) === e.target.value);
                          if (matched) {
                            setCameraName(matched.location || matched.name || `Camera ${e.target.value}`);
                          }
                        }}
                        className="w-full bg-[#101210] border border-[#1E231E] rounded-lg px-3 py-2 text-white"
                      >
                        {cameras.length === 0 ? (
                          <option value="1">Main Gate (Default)</option>
                        ) : (
                          cameras.map((c) => (
                            <option key={c.camera_id} value={String(c.camera_id)}>
                              {c.location || c.name || `Camera #${c.camera_id}`} (ID: {c.camera_id})
                            </option>
                          ))
                        )}
                      </select>
                    )}
                  </div>

                  {/* Video Metadata */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-gray-400 block mb-1">Video Name</label>
                      <input
                        type="text"
                        placeholder="Main Gate - Morning"
                        value={videoName}
                        onChange={(e) => setVideoName(e.target.value)}
                        className="w-full bg-[#101210] border border-[#1E231E] rounded-lg px-3 py-2 text-white"
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 block mb-1">Start Time (ISO/Time)</label>
                      <input
                        type="text"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full bg-[#101210] border border-[#1E231E] rounded-lg px-3 py-2 text-white"
                      />
                    </div>
                  </div>

                  {/* Real-time Upload Progress Bar */}
                  {isUploading && (
                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between text-[11px] text-gray-400">
                        <span>Uploading CCTV footage...</span>
                        <span className="text-emerald-400 font-bold">{uploadPct}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#101210] overflow-hidden border border-[#1E231E]">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-150"
                          style={{ width: `${uploadPct}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-gray-500 text-right">
                        {formatBytes(loadedBytes)} / {formatBytes(totalBytes)}
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2 border-t border-[#1E231E]">
                    <button
                      type="button"
                      onClick={() => setShowUploadModal(false)}
                      className="px-3 py-2 rounded-lg bg-[#101210] text-gray-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isUploading || !selectedFile}
                      className="px-4 py-2 rounded-lg bg-emerald-500 text-stone-950 font-bold hover:bg-emerald-400 disabled:opacity-50"
                    >
                      {isUploading ? "Uploading..." : "Start Processing"}
                    </button>
                  </div>
                </form>
              ) : (
                /* Processing Pipeline Stepper */
                <div className="space-y-5 text-xs font-mono py-2">
                  <div className="p-4 rounded-xl bg-[#101210] border border-[#1E231E] space-y-3">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-emerald-400 animate-pulse" />
                      YOLO11 & Vector Index Pipeline
                    </h4>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-gray-300">
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Upload File
                        </span>
                        <span className="text-[10px] text-emerald-400">DONE</span>
                      </div>

                      <div className="flex items-center justify-between text-gray-300">
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Video Validation & OpenCV Probe
                        </span>
                        <span className="text-[10px] text-emerald-400">DONE</span>
                      </div>

                      <div className="flex items-center justify-between text-gray-300">
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Frame Extraction & Downsampling
                        </span>
                        <span className="text-[10px] text-emerald-400">DONE</span>
                      </div>

                      <div className="flex items-center justify-between text-white">
                        <span className="flex items-center gap-2">
                          <Cpu className={`w-4 h-4 ${processingStatus === "processing" ? "text-emerald-400 animate-spin" : "text-emerald-400"}`} />
                          YOLO11 Object Detection & Bbox Grounding
                        </span>
                        <span className="text-[10px] text-emerald-400 font-bold">
                          {processingStatus === "completed" || processingStatus === "ready" ? "READY" : "ACTIVE"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-gray-300">
                        <span className="flex items-center gap-2">
                          <Layers className="w-4 h-4 text-emerald-400" /> CLIP 512-dim Vector Embeddings
                        </span>
                        <span className="text-[10px] text-emerald-400">
                          {processingStatus === "completed" || processingStatus === "ready" ? "INDEXED" : "QUEUED"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {pipelineError && (
                    <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                      Pipeline Error: {pipelineError}
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowUploadModal(false)}
                      className="px-4 py-2 rounded-lg bg-emerald-500 text-stone-950 font-bold hover:bg-emerald-400"
                    >
                      Close & View Index
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── INGEST STREAM MODAL ────────────────────────────────────────── */}
        {showStreamModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#151815] border border-[#1E231E] rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                <Film className="w-4 h-4 text-emerald-400" />
                Register Stream Path
              </h3>
              <form onSubmit={handleStreamIngest} className="space-y-3 font-mono text-xs">
                <div>
                  <label className="text-gray-400 block mb-1">Camera ID</label>
                  <input
                    type="text"
                    value={streamForm.camera_id}
                    onChange={(e) => setStreamForm({ ...streamForm, camera_id: e.target.value })}
                    className="w-full bg-[#101210] border border-[#1E231E] rounded-lg px-3 py-2 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="text-gray-400 block mb-1">Location Name</label>
                  <input
                    type="text"
                    value={streamForm.camera_name}
                    onChange={(e) => setStreamForm({ ...streamForm, camera_name: e.target.value })}
                    className="w-full bg-[#101210] border border-[#1E231E] rounded-lg px-3 py-2 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="text-gray-400 block mb-1">Video File / Stream URL Path</label>
                  <input
                    type="text"
                    value={streamForm.file_path}
                    onChange={(e) => setStreamForm({ ...streamForm, file_path: e.target.value })}
                    className="w-full bg-[#101210] border border-[#1E231E] rounded-lg px-3 py-2 text-white"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowStreamModal(false)}
                    className="px-3 py-2 rounded-lg bg-[#101210] text-gray-300 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={streamIngesting}
                    className="px-4 py-2 rounded-lg bg-emerald-500 text-stone-950 font-bold hover:bg-emerald-400"
                  >
                    {streamIngesting ? "Registering..." : "Register Stream"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── VIDEO DETAILS & PLAYBACK MODAL ──────────────────────────────── */}
        {selectedVideoDetails && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#151815] border border-[#1E231E] rounded-xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-[#1E231E] pb-3">
                <div>
                  <h3 className="text-base font-bold text-white font-mono flex items-center gap-2">
                    <Film className="w-4 h-4 text-emerald-400" />
                    {selectedVideoDetails.filename || selectedVideoDetails.video_id}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {selectedVideoDetails.camera_name || `Camera #${selectedVideoDetails.camera_id}`} • Duration: {selectedVideoDetails.duration_seconds || 0}s
                  </p>
                </div>
                <button
                  onClick={() => setSelectedVideoDetails(null)}
                  className="text-gray-400 hover:text-white text-xs"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Video Player */}
              <div className="bg-[#101210] rounded-xl p-2 border border-[#1E231E] overflow-hidden flex flex-col items-center">
                <video
                  ref={videoRef}
                  controls
                  onLoadedMetadata={handleLoadedMetadata}
                  className="w-full max-h-80 object-contain rounded-lg"
                  src={
                    selectedVideoDetails.stream_url
                      ? (selectedVideoDetails.stream_url.startsWith("http")
                          ? selectedVideoDetails.stream_url
                          : `${API_BASE}${selectedVideoDetails.stream_url}`)
                      : `${API_BASE}/api/videos/${selectedVideoDetails.video_id}/stream`
                  }
                />
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-3 rounded-lg bg-[#101210] border border-[#1E231E]">
                  <span className="text-[10px] text-gray-500 block">Detector</span>
                  <span className="text-sm font-bold text-emerald-400">YOLO11</span>
                </div>
                <div className="p-3 rounded-lg bg-[#101210] border border-[#1E231E]">
                  <span className="text-[10px] text-gray-500 block">Detections</span>
                  <span className="text-sm font-bold text-white">
                    {selectedVideoDetails.detection_count ?? selectedVideoDetails.total_detections ?? 0}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-[#101210] border border-[#1E231E]">
                  <span className="text-[10px] text-gray-500 block">Indexed Frames</span>
                  <span className="text-sm font-bold text-emerald-400">
                    {selectedVideoDetails.frames_count ?? selectedVideoDetails.frame_count ?? 0}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-[#101210] border border-[#1E231E]">
                  <span className="text-[10px] text-gray-500 block">CLIP Index</span>
                  <span className="text-sm font-bold text-gray-300">Ready</span>
                </div>
              </div>

              {/* Timeline Seeking Jump Markers */}
              <div className="p-4 rounded-xl bg-[#101210] border border-[#1E231E] space-y-2 text-xs font-mono">
                <h4 className="font-bold text-gray-300 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  Jump to Timestamp Offset
                </h4>
                <div className="flex flex-wrap gap-2">
                  {[0, 15, 30, 45, 60].map((sec) => (
                    <button
                      key={sec}
                      onClick={() => {
                        if (videoRef.current) {
                          videoRef.current.currentTime = sec;
                          videoRef.current.play();
                        }
                      }}
                      className="px-2.5 py-1 rounded bg-[#151815] border border-[#1E231E] hover:border-emerald-500/40 text-emerald-400 font-bold"
                    >
                      {Math.floor(sec / 60)}:{sec % 60 < 10 ? "0" : ""}{sec % 60}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#1E231E]">
                <Link
                  href={`/search?video_id=${selectedVideoDetails.video_id}&camera_id=${selectedVideoDetails.camera_id}`}
                  className="px-4 py-2 rounded-lg bg-emerald-500 text-stone-950 font-bold hover:bg-emerald-400 text-xs"
                >
                  Query Footage in AI Search →
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
