"use client";

import React, { useState, useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import {
  FileSearch,
  Camera,
  Clock,
  Route,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { api } from "@/lib/api";
import Link from "next/link";

export default function InvestigationsPage() {
  const [identities, setIdentities] = useState<any[]>([]);
  const [selectedIdentity, setSelectedIdentity] = useState<string>("");
  const [journey, setJourney] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadIdentities() {
      try {
        const list = await api.listIdentities();
        setIdentities(list || []);
        if (list && list.length > 0) {
          setSelectedIdentity(list[0].identity_id);
          fetchJourney(list[0].identity_id);
        }
      } catch (err) {
        console.error("Failed to load identities:", err);
      }
    }
    loadIdentities();
  }, []);

  async function fetchJourney(id: string) {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.getIdentityJourney(id);
      setJourney(data);
    } catch (err) {
      console.error("Failed to fetch journey:", err);
      setJourney(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="border-b border-[#1E231E] pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileSearch className="w-5 h-5 text-emerald-400" />
              <h1 className="text-xl font-bold text-white tracking-tight font-mono">
                Investigation Workspace
              </h1>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Grounded multi-camera entity tracing &amp; timeline synthesis
            </p>
          </div>

          {/* Select Identity Dropdown */}
          {identities.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-mono">Select Entity:</span>
              <select
                value={selectedIdentity}
                onChange={(e) => {
                  setSelectedIdentity(e.target.value);
                  fetchJourney(e.target.value);
                }}
                className="px-3 py-1.5 rounded-lg bg-[#181C18] border border-[#262C26] text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              >
                {identities.map((item) => (
                  <option key={item.identity_id} value={item.identity_id}>
                    {item.identity_id} ({item.total_observations} sightings)
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Investigation Workflow */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel: Entity & Sightings List */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-400" />
              Tracked Entities
            </h2>

            {identities.length === 0 ? (
              <div className="p-6 text-center bg-[#141714] rounded-xl border border-[#222722] text-xs text-gray-400">
                No tracked identities detected yet. Process CCTV footage to register identities.
              </div>
            ) : (
              <div className="space-y-2">
                {identities.map((item) => (
                  <div
                    key={item.identity_id}
                    onClick={() => {
                      setSelectedIdentity(item.identity_id);
                      fetchJourney(item.identity_id);
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      selectedIdentity === item.identity_id
                        ? "bg-emerald-500/15 border-emerald-500/40 text-white"
                        : "bg-[#141714] border-[#222722] text-gray-300 hover:border-emerald-500/30"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs">{item.identity_id}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                        {item.total_observations || 1} sightings
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      First camera: {item.first_camera || "CAM-01"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Panel: Investigation Timeline & Grounded AI Summary */}
          <div className="lg:col-span-2 space-y-6">
            {loading ? (
              <div className="p-12 text-center bg-[#141714] rounded-2xl border border-[#222722] text-xs text-gray-400">
                Synthesizing investigation timeline...
              </div>
            ) : !journey ? (
              <div className="p-12 text-center bg-[#141714] rounded-2xl border border-[#222722] text-xs text-gray-400">
                Select an entity on the left to inspect multi-camera sightings.
              </div>
            ) : (
              <div className="space-y-6">
                {/* AI Summary Card */}
                <div className="p-5 rounded-2xl bg-[#141714] border border-[#222722] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 font-semibold uppercase">
                    <Sparkles className="w-4 h-4" /> AI Grounded Investigation Summary
                  </div>
                  <p className="text-sm text-gray-200 leading-relaxed font-sans">
                    {journey.journey_summary}
                  </p>
                  <div className="pt-2 flex flex-wrap gap-4 text-xs font-mono text-gray-400">
                    <div>
                      <span className="text-gray-500">Route:</span> {journey.route || "CAM-01"}
                    </div>
                    <div>
                      <span className="text-gray-500">Timeline Window:</span> {journey.start_time} - {journey.end_time}
                    </div>
                  </div>
                </div>

                {/* Sightings Timeline */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-400" />
                    Chronological Multi-Camera Timeline
                  </h3>

                  <div className="relative border-l-2 border-emerald-500/30 ml-4 pl-6 space-y-6">
                    {journey.timeline?.map((step: any, idx: number) => (
                      <div key={idx} className="relative group">
                        {/* Timeline Node Icon */}
                        <div className="absolute -left-[31px] top-0.5 w-4 h-4 rounded-full bg-emerald-500 border-4 border-[#0C0E0C] shadow" />

                        <div className="p-4 rounded-xl bg-[#141714] border border-[#222722] hover:border-emerald-500/30 transition-all space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="text-xs font-bold text-white font-mono">
                                Step {step.step}: Camera {step.camera_id}
                              </span>
                              <span className="text-[11px] font-mono text-emerald-400 block">
                                Timestamp: {step.timestamp} ({step.timestamp_seconds}s)
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                              Confidence: {(step.confidence * 100).toFixed(0)}%
                            </span>
                          </div>

                          {step.evidence_url && (
                            <div className="aspect-video max-w-sm rounded-lg overflow-hidden border border-[#262C26] bg-black">
                              <img
                                src={step.evidence_url}
                                alt="Observation Evidence"
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}

                          {step.next_camera && (
                            <div className="text-[11px] text-gray-400 font-mono flex items-center gap-1.5 pt-1 border-t border-[#1E231E]">
                              <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                              <span>
                                Transition to {step.next_camera} in {step.travel_time_seconds}s
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
