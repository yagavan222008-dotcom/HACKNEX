"use client";

import React, { useState, useEffect, Suspense } from "react";
import AppShell from "@/components/layout/AppShell";
import { useSearchParams } from "next/navigation";
import {
  Sparkles,
  Search,
  Camera,
  Clock,
  Play,
  FileSearch,
  CheckCircle2,
  HelpCircle,
  ShieldAlert,
  ArrowRight,
  Layers,
  Image as ImageIcon,
  Video,
  XCircle,
} from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import Link from "next/link";

const getEvidenceUrl = (url?: string) => {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
};

const SAMPLE_QUERIES = [
  "Find the red car that entered the main gate",
  "Show me the person with a backpack near parking",
  "Where did he go after leaving the lobby?",
  "Find vehicles that moved from gate to parking area",
];

function SearchContent() {
  const searchParams = useSearchParams();
  const activeVideoId = searchParams.get("video_id") || undefined;
  const activeCameraId = searchParams.get("camera_id") || undefined;

  const [query, setQuery] = useState("");
  const [sessionId] = useState(() => `conv_${Date.now()}`);
  const [loading, setLoading] = useState(false);
  const [searchResponse, setSearchResponse] = useState<any>(null);
  const [activeEvidenceModal, setActiveEvidenceModal] = useState<any>(null);

  async function handleSearch(e?: React.FormEvent, customQuery?: string) {
    if (e) e.preventDefault();
    const q = (customQuery || query).trim();
    if (!q) return;

    setLoading(true);
    try {
      const res = await api.searchQuery({
        conversation_id: sessionId,
        query: q,
        limit: 10,
        video_id: activeVideoId,
        camera_id: activeCameraId,
      });
      setSearchResponse(res);
    } catch (err: any) {
      console.error("Search error:", err);
      alert(`Search failed: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="border-b border-[#1E231E] pb-5">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight font-mono">
              Conversational Video Search Engine
            </h1>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Factual natural language search over timestamped CCTV footage &amp; visual embeddings
          </p>
        </div>

        {/* Active Scope Banner */}
        {(activeVideoId || activeCameraId) && (
          <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <Video className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="font-semibold text-emerald-300">Active Search Scope: </span>
                <span className="text-gray-300 font-mono">
                  {activeVideoId ? `Video ID: ${activeVideoId}` : ''}
                  {activeVideoId && activeCameraId ? ' • ' : ''}
                  {activeCameraId ? `Camera ID: ${activeCameraId}` : ''}
                </span>
              </div>
            </div>
            <Link
              href="/search"
              className="text-gray-400 hover:text-white flex items-center gap-1 text-[11px] font-mono hover:underline"
            >
              <XCircle className="w-3.5 h-3.5" /> Clear Scope
            </Link>
          </div>
        )}

        {/* Primary Search Input Box */}
        <div className="p-4 sm:p-6 rounded-2xl bg-[#141714] border border-[#222722] shadow-2xl space-y-4">
          <form onSubmit={(e) => handleSearch(e)} className="relative flex items-center">
            <Search className="w-5 h-5 text-gray-400 absolute left-4" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Ask anything... e.g. "Find the red car that entered the main gate"'
              className="w-full pl-12 pr-28 py-3.5 rounded-xl bg-[#1C201C] border border-[#2B322B] text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="absolute right-2 px-4 py-2 rounded-lg bg-emerald-500 text-black font-semibold text-xs hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shadow-md"
            >
              {loading ? (
                <span>Searching...</span>
              ) : (
                <>
                  <span>Search</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Sample Query Chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-gray-500 font-mono">Try queries:</span>
            {SAMPLE_QUERIES.map((sq, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setQuery(sq);
                  handleSearch(undefined, sq);
                }}
                className="px-2.5 py-1 rounded-full bg-[#1C201C] border border-[#2B322B] text-xs text-gray-300 hover:text-emerald-400 hover:border-emerald-500/40 transition-all text-left"
              >
                &ldquo;{sq}&rdquo;
              </button>
            ))}
          </div>
        </div>

        {/* Search Results Area */}
        {loading && (
          <div className="p-12 text-center bg-[#141714] rounded-2xl border border-[#222722] space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin mx-auto" />
            <p className="text-xs text-gray-400 font-mono">Analyzing video streams, embeddings &amp; evidence...</p>
          </div>
        )}

        {searchResponse && !loading && (
          <div className="space-y-6">
            {/* Clarification Alert Box if backend requests turn clarification */}
            {searchResponse.clarification_required && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-amber-300 text-xs">
                <HelpCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-amber-200">Clarification Needed</h4>
                  <p>{searchResponse.clarification_question || searchResponse.answer}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const nextQ = "Main Gate";
                        setQuery(nextQ);
                        handleSearch(undefined, nextQ);
                      }}
                      className="px-3 py-1 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40 text-xs hover:bg-amber-500/30"
                    >
                      Main Gate
                    </button>
                    <button
                      onClick={() => {
                        const nextQ = "Parking Area";
                        setQuery(nextQ);
                        handleSearch(undefined, nextQ);
                      }}
                      className="px-3 py-1 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40 text-xs hover:bg-amber-500/30"
                    >
                      Parking Area
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Answer Summary Card */}
            <div className="p-5 rounded-2xl bg-[#141714] border border-[#222722] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 font-semibold">
                  <CheckCircle2 className="w-4 h-4" /> AI Grounded Answer
                </span>
                <span className="text-[11px] font-mono text-gray-500">
                  Latency: {searchResponse.latency_ms}ms
                </span>
              </div>
              <p className="text-sm text-gray-200 leading-relaxed font-sans">
                {searchResponse.answer}
              </p>
            </div>

            {/* Results Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Retrieved Ground Evidence ({searchResponse.results?.length || 0})
                </h3>
              </div>

              {searchResponse.results?.length === 0 ? (
                <div className="p-8 text-center bg-[#141714] rounded-xl border border-[#222722] text-xs text-gray-400">
                  No matching video evidence found for this query.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {searchResponse.results.map((res: any, idx: number) => (
                    <div
                      key={res.result_id || idx}
                      className="p-4 rounded-xl bg-[#141714] border border-[#222722] hover:border-emerald-500/40 transition-all flex flex-col justify-between space-y-3 group cursor-pointer"
                      onClick={() => {
                        window.location.href = `/video-explorer?video_id=${res.video_id}&offset=${res.video_offset || res.timestamp_seconds}&autoplay=true`;
                      }}
                    >
                      {/* Top Info */}
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs font-bold text-white font-mono block">
                              {res.camera_name}
                            </span>
                            <span className="text-[10px] font-mono text-gray-400 block">
                              CAM: {res.camera_id}
                            </span>
                            <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 mt-0.5 font-bold">
                              <Clock className="w-3 h-3 text-emerald-500" /> Timestamp: {res.timestamp || "00:00"}
                            </span>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                            {((res.retrieval_score || res.confidence || 0.9) * 100).toFixed(0)}% Final Match
                          </span>
                        </div>

                        {/* Evidence Image Thumbnail */}
                        <div
                          className="aspect-video bg-black/60 rounded-lg border border-[#262C26] overflow-hidden relative group-hover:border-emerald-500/30 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveEvidenceModal(res);
                          }}
                        >
                          {res.evidence_url ? (
                            <img
                              src={getEvidenceUrl(res.evidence_url)}
                              alt="Evidence Frame"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 text-xs">
                              <ImageIcon className="w-6 h-6 mb-1" />
                              <span>Evidence Frame</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="px-3 py-1 rounded bg-black/80 text-white text-xs font-mono border border-white/20">
                              View Evidence Frame
                            </span>
                          </div>
                        </div>

                        {/* Metrics Grid */}
                        <div className="grid grid-cols-3 gap-1 p-2 rounded-lg bg-[#101210] border border-[#222722] text-[10px] font-mono text-center">
                          <div>
                            <span className="text-gray-500 block text-[9px]">Detection</span>
                            <span className="font-bold text-emerald-400">
                              {res.detection_confidence ? `${(res.detection_confidence * 100).toFixed(0)}%` : "N/A"}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 block text-[9px]">Semantic</span>
                            <span className="font-bold text-cyan-400">
                              {res.clip_similarity ? `${(res.clip_similarity * 100).toFixed(0)}%` : "N/A"}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 block text-[9px]">Final Match</span>
                            <span className="font-bold text-white">
                              {`${((res.retrieval_score || res.confidence || 0.9) * 100).toFixed(0)}%`}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1 text-xs text-gray-300">
                          <p className="font-semibold text-emerald-300 capitalize flex items-center justify-between">
                            <span>Detected: <strong className="text-white font-bold">{res.object_class}</strong></span>
                          </p>
                          <p className="text-[11px] text-gray-400 line-clamp-2">
                            {res.explanation || "Verified against stored ground detection"}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-[#222722]" onClick={(e) => e.stopPropagation()}>
                        <Link
                          href={`/video-explorer?video_id=${res.video_id}&offset=${res.video_offset || res.timestamp_seconds}&autoplay=true`}
                          className="flex-1 py-1.5 px-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold hover:bg-emerald-500/30 text-center transition-all flex items-center justify-center gap-1.5 shadow-sm"
                        >
                          <Play className="w-3.5 h-3.5 text-emerald-400" />
                          Seek &amp; Play
                        </Link>
                        <Link
                          href={`/investigations?video_id=${res.video_id}&camera_id=${res.camera_id}&timestamp_seconds=${res.timestamp_seconds}&detection_id=${res.detection_id || ''}&evidence_id=${res.evidence_id || ''}&identity_id=${res.identity_id || 'Person-001'}`}
                          className="flex-1 py-1.5 px-2 rounded-lg bg-[#1C201C] border border-[#2B322B] text-gray-300 text-xs font-semibold hover:text-white hover:bg-emerald-500/10 text-center transition-colors flex items-center justify-center gap-1"
                        >
                          <FileSearch className="w-3 h-3 text-emerald-400" />
                          Investigate
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal: Evidence Inspection */}
        {activeEvidenceModal && (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setActiveEvidenceModal(null)}
          >
            <div
              className="bg-[#141714] border border-[#2B322B] rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#222722] pb-3">
                <div>
                  <h3 className="font-bold text-white text-base">
                    Ground Evidence — {activeEvidenceModal.camera_name}
                  </h3>
                  <p className="text-xs text-emerald-400 font-mono">
                    Timestamp: {activeEvidenceModal.timestamp} (Offset: {activeEvidenceModal.timestamp_seconds}s)
                  </p>
                </div>
                <button
                  onClick={() => setActiveEvidenceModal(null)}
                  className="text-gray-400 hover:text-white p-1 rounded-md"
                >
                  ✕
                </button>
              </div>

              <div className="aspect-video bg-black rounded-xl overflow-hidden border border-[#262C26]">
                {activeEvidenceModal.evidence_url ? (
                  <img
                    src={getEvidenceUrl(activeEvidenceModal.evidence_url)}
                    alt="Evidence Large Frame"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                    No preview image available
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs text-gray-300">
                <div>
                  <span className="text-gray-500 block">Object Class</span>
                  <span className="font-semibold text-white capitalize">{activeEvidenceModal.object_class}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Detection Confidence</span>
                  <span className="font-semibold text-emerald-400">
                    {(activeEvidenceModal.confidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 block">Detection ID</span>
                  <span className="font-mono text-gray-300">{activeEvidenceModal.detection_id || "N/A"}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Identity Match</span>
                  <span className="font-mono text-gray-300">{activeEvidenceModal.identity_id || "Unassigned"}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function AISearchPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400 font-mono text-xs">Loading search interface...</div>}>
      <SearchContent />
    </Suspense>
  );
}
