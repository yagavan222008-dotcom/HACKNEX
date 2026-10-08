"use client";

import React, { useState, useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import {
  Route,
  Camera,
  Clock,
  ArrowRight,
  ShieldCheck,
  Search,
  Sparkles,
  MapPin,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { api } from "@/lib/api";

export default function JourneysPage() {
  const [identities, setIdentities] = useState<any[]>([]);
  const [selectedIdentity, setSelectedIdentity] = useState<string>("");
  const [journeyData, setJourneyData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadIdentities() {
      try {
        const list = await api.listIdentities();
        setIdentities(list || []);
        if (list && list.length > 0) {
          setSelectedIdentity(list[0].identity_id);
          loadJourney(list[0].identity_id);
        }
      } catch (err) {
        console.error("Failed to load identities:", err);
      }
    }
    loadIdentities();
  }, []);

  async function loadJourney(identityId: string) {
    if (!identityId) return;
    setLoading(true);
    try {
      const data = await api.getIdentityJourney(identityId);
      setJourneyData(data);
    } catch (err) {
      console.error("Failed to load journey:", err);
      setJourneyData(null);
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
              <Route className="w-5 h-5 text-emerald-400" />
              <h1 className="text-xl font-bold text-white tracking-tight font-mono">
                Cross-Camera Journey Reconstruction
              </h1>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Track entity movements across cameras (Main Gate → Parking → Lobby) with spatial-temporal graph reasoning.
            </p>
          </div>
        </div>

        {/* Identity Selector */}
        <div className="bg-[#151815] border border-[#1E231E] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">Select Tracked Identity:</span>
            <select
              value={selectedIdentity}
              onChange={(e) => {
                setSelectedIdentity(e.target.value);
                loadJourney(e.target.value);
              }}
              className="bg-[#101210] border border-[#1E231E] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
            >
              {identities.length === 0 ? (
                <option value="">No identities resolved yet</option>
              ) : (
                identities.map((id: any) => (
                  <option key={id.identity_id} value={id.identity_id}>
                    {id.identity_id} ({id.label || id.object_class || "Target"})
                  </option>
                ))
              )}
            </select>
          </div>

          {journeyData && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4" />
              <span>Route: {journeyData.route}</span>
            </div>
          )}
        </div>

        {/* Journey Timeline */}
        {loading ? (
          <div className="p-12 text-center text-xs text-gray-500 font-mono">Reconstructing trajectory graph...</div>
        ) : !journeyData ? (
          <div className="p-12 text-center border border-dashed border-[#1E231E] rounded-xl bg-[#151815] font-mono text-xs text-gray-500">
            No journey data available for selected entity.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Grounded Summary */}
            <div className="bg-[#151815] border border-[#1E231E] rounded-xl p-5 space-y-2 font-mono">
              <h3 className="text-xs font-semibold text-emerald-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Spatial-Temporal Grounded Narrative
              </h3>
              <p className="text-xs text-gray-300 leading-relaxed">
                {journeyData.journey_summary || "Entity trajectory reconstructed across cameras based on verified timestamps."}
              </p>
            </div>

            {/* Visual Timeline Nodes */}
            <div className="bg-[#151815] border border-[#1E231E] rounded-xl p-6 font-mono">
              <h3 className="text-xs font-semibold text-gray-400 mb-6 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                Chronological Detection Nodes ({journeyData.timeline?.length || 0} observations)
              </h3>

              <div className="space-y-4 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#1E231E]">
                {journeyData.timeline?.map((step: any, idx: number) => (
                  <div key={idx} className="relative pl-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-[#101210] border border-[#1E231E]">
                    <div className="absolute left-2.5 top-5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#151815]" />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-white">{step.camera_id}</span>
                        <span className="text-[10px] text-gray-500 bg-[#151815] px-2 py-0.5 rounded border border-[#1E231E]">
                          Step {step.step}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        Observed at timestamp: <span className="text-emerald-400">{step.timestamp}</span>
                      </p>
                    </div>

                    {step.next_camera && (
                      <div className="text-[11px] text-gray-400 flex items-center gap-1.5 bg-[#151815] px-3 py-1.5 rounded-lg border border-[#1E231E]">
                        <span>Moved to {step.next_camera}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">+{step.travel_time_seconds}s</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
