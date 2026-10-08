"use client";

import React, { useState, useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import {
  Bell,
  Search,
  Filter,
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  Camera,
  ArrowRight,
  RefreshCw,
  Eye,
  FileSearch,
} from "lucide-react";
import { api } from "@/lib/api";
import Link from "next/link";

export default function AlertsPage() {
  const [alertLogs, setAlertLogs] = useState<any[]>([]);
  const [cameras, setCameras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [cameraFilter, setCameraFilter] = useState("all");
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);

  async function fetchAlertData() {
    setLoading(true);
    try {
      const [logsRes, camsRes] = await Promise.allSettled([
        api.listAlertLogs(),
        api.listCameras(),
      ]);

      if (logsRes.status === "fulfilled") {
        setAlertLogs(logsRes.value || []);
      }
      if (camsRes.status === "fulfilled") {
        setCameras(camsRes.value || []);
      }
    } catch (err) {
      console.error("Failed to fetch alert logs:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAlertData();

    // Subscribe to SSE real-time alerts
    let es: EventSource | null = null;
    try {
      es = api.streamAlerts();
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data && (data.message || data.alert_id)) {
            setAlertLogs((prev) => [data, ...prev]);
          }
        } catch (e) {
          // ignore stream parse error
        }
      };
    } catch (e) {
      console.warn("SSE alert stream connection unavailable");
    }

    return () => {
      if (es) es.close();
    };
  }, []);

  // Filter logs based on search query, severity, and camera
  const filteredLogs = alertLogs.filter((log) => {
    const matchesSearch =
      !searchQuery ||
      log.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(log.camera_id || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.event_id?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSeverity =
      severityFilter === "all" ||
      (log.severity || "info").toLowerCase() === severityFilter.toLowerCase();

    const matchesCamera =
      cameraFilter === "all" ||
      String(log.camera_id || "") === String(cameraFilter);

    return matchesSearch && matchesSeverity && matchesCamera;
  });

  const getSeverityBadge = (severity?: string) => {
    const sev = (severity || "info").toLowerCase();
    switch (sev) {
      case "critical":
      case "high":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <ShieldAlert className="w-3 h-3" />
            CRITICAL
          </span>
        );
      case "medium":
      case "warning":
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3" />
            WARNING
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Info className="w-3 h-3" />
            INFO
          </span>
        );
    }
  };

  return (
    <AppShell>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full font-mono">
        {/* Header */}
        <div className="border-b border-[#1E231E] pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-emerald-400" />
              <h1 className="text-xl font-bold text-white tracking-tight font-mono">
                Security Alerts
              </h1>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Monitor event-grounded alerts across your camera network.
            </p>
          </div>
          <button
            onClick={fetchAlertData}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#151815] border border-[#1E231E] hover:border-emerald-500/40 text-gray-300 hover:text-white text-xs transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh Alerts</span>
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-[#151815] border border-[#1E231E] rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search alert message or camera..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#101210] border border-[#1E231E] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* Severity Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full bg-[#101210] border border-[#1E231E] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical / High</option>
              <option value="medium">Warning / Medium</option>
              <option value="info">Informational</option>
            </select>
          </div>

          {/* Camera Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Camera:</span>
            <select
              value={cameraFilter}
              onChange={(e) => setCameraFilter(e.target.value)}
              className="w-full bg-[#101210] border border-[#1E231E] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500/50"
            >
              <option value="all">All Cameras</option>
              {cameras.map((c) => (
                <option key={c.camera_id} value={c.camera_id}>
                  {c.location || `Camera #${c.camera_id}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Alerts List */}
        {loading ? (
          <div className="p-12 text-center text-xs text-gray-500">Querying real-time security alerts...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-[#1E231E] rounded-xl bg-[#151815]">
            <CheckCircle2 className="w-8 h-8 text-emerald-500/60 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-gray-300">No active alerts</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
              No alert triggers matched the current search and filter criteria.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLogs.map((log, index) => (
              <div
                key={log.id || index}
                className="bg-[#151815] border border-[#1E231E] hover:border-emerald-500/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-[#101210] border border-[#1E231E] text-gray-400">
                    <Camera className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      {getSeverityBadge(log.severity)}
                      <span className="text-xs font-bold text-white">
                        {log.camera_name || `Camera #${log.camera_id ?? "N/A"}`}
                      </span>
                      <span className="text-[10px] text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {log.triggered_at ? new Date(log.triggered_at).toLocaleString() : "Just now"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300">{log.message || "Rule triggered detection event."}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:self-center">
                  {log.snapshot && (
                    <button
                      onClick={() => setSelectedSnapshot(log.snapshot)}
                      className="px-3 py-1.5 rounded-lg bg-[#101210] border border-[#1E231E] text-xs text-gray-300 hover:text-white flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Evidence Frame</span>
                    </button>
                  )}
                  <Link
                    href={`/investigations`}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 hover:bg-emerald-500/20 flex items-center gap-1.5"
                  >
                    <FileSearch className="w-3.5 h-3.5" />
                    <span>Investigate</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Evidence Snapshot Modal */}
        {selectedSnapshot && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#151815] border border-[#1E231E] rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-emerald-400" />
                  Alert Evidence Snapshot
                </h3>
                <button
                  onClick={() => setSelectedSnapshot(null)}
                  className="text-gray-400 hover:text-white text-xs"
                >
                  ✕ Close
                </button>
              </div>
              <div className="bg-[#101210] rounded-lg p-2 overflow-hidden border border-[#1E231E] flex items-center justify-center">
                <img
                  src={selectedSnapshot}
                  alt="Alert Snapshot"
                  className="max-h-96 object-contain rounded"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
