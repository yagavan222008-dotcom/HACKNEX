"use client";

import React, { useState, useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import {
  Brain,
  Database,
  Users,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/api";

export default function MemoryPage() {
  const [identities, setIdentities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMemory() {
      setLoading(true);
      try {
        const list = await api.listIdentities();
        setIdentities(list || []);
      } catch (err) {
        console.error("Failed to load memory:", err);
      } finally {
        setLoading(false);
      }
    }
    loadMemory();
  }, []);

  return (
    <AppShell>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="border-b border-[#1E231E] pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-emerald-400" />
              <h1 className="text-xl font-bold text-white tracking-tight font-mono">
                Conversational Memory & Identity Store
              </h1>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Persistent memory store tracking cross-session entities, multi-camera embeddings, and resolved object identities.
            </p>
          </div>
        </div>

        {/* Identity Cards */}
        {loading ? (
          <div className="p-12 text-center text-xs text-gray-500 font-mono">Accessing MongoDB entity memory...</div>
        ) : identities.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-[#1E231E] rounded-xl bg-[#151815] font-mono text-xs text-gray-500">
            No resolved identities in persistent memory yet. Ingest CCTV streams to generate entity embeddings.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {identities.map((item: any) => (
              <div
                key={item.identity_id}
                className="rounded-xl border border-[#1E231E] bg-[#151815] p-5 space-y-4 hover:border-emerald-500/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {item.object_class || "Resolved Entity"}
                  </span>
                  <span className="text-[10px] font-mono text-gray-500">
                    ID: {item.identity_id}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-white font-mono">{item.label || item.identity_id}</h3>
                  <p className="text-xs text-gray-400 font-mono mt-1">
                    First seen at: <span className="text-gray-300">{item.first_seen || "N/A"}</span>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-[#101210] border border-[#1E231E] font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-gray-500 block">Cameras Visited</span>
                    <span className="text-xs font-semibold text-emerald-400">
                      {item.cameras_visited?.length || 1} Camera(s)
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 block">Embedding Vector</span>
                    <span className="text-xs font-semibold text-gray-300">512-dim CLIP</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#1E231E] font-mono text-xs">
                  <a
                    href={`/journeys?identity=${item.identity_id}`}
                    className="text-emerald-400 hover:underline text-[11px] flex items-center gap-1"
                  >
                    View Re-ID Trajectory →
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
