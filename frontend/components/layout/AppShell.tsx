"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Sparkles,
  FileSearch,
  Camera,
  Film,
  Route,
  Bell,
  Brain,
  Award,
  Server,
  Activity,
  ChevronLeft,
  Menu,
  X,
  Search,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { api } from "@/lib/api";

const NAV_ITEMS = [
  { name: "Overview", href: "/", icon: LayoutDashboard },
  { name: "AI Search", href: "/search", icon: Sparkles, badge: "EPS05" },
  { name: "Investigations", href: "/investigations", icon: FileSearch },
  { name: "Cameras", href: "/cameras", icon: Camera },
  { name: "Video Explorer", href: "/video-explorer", icon: Film },
  { name: "Journeys", href: "/journeys", icon: Route },
  { name: "Alerts", href: "/alerts", icon: Bell },
  { name: "Memory", href: "/memory", icon: Brain },
  { name: "Evaluation", href: "/evaluation", icon: Award },
  { name: "System", href: "/system", icon: Server },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sysStatus, setSysStatus] = useState<{ backend: string; activeJobs: number } | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchStatus() {
      try {
        const status = await api.getSystemStatus();
        if (isMounted) {
          setSysStatus({
            backend: status.backend || "online",
            activeJobs: status.video_processing?.active_jobs_count || 0,
          });
        }
      } catch (err) {
        if (isMounted) {
          setSysStatus({ backend: "offline", activeJobs: 0 });
        }
      }
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0C0E0C] text-[#E5E7EB] flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Top Banner Bar / Header */}
      <header className="h-14 border-b border-[#1E231E] bg-[#121512]/90 backdrop-blur-md sticky top-0 z-40 flex items-center justify-between px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden text-gray-400 hover:text-white p-1 rounded-md hover:bg-white/5"
            aria-label="Toggle Navigation Menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <Sparkles className="w-4 h-4 text-black font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-white font-mono">SPECTRA</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                  EPS05
                </span>
              </div>
              <p className="text-[10px] text-gray-400 leading-none">Multi-Stream Video Intelligence</p>
            </div>
          </Link>
        </div>

        {/* Header Center / Quick Global Search Trigger */}
        <div className="hidden md:flex items-center flex-1 max-w-md mx-8">
          <Link
            href="/search"
            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[#181C18] border border-[#262C26] text-xs text-gray-400 hover:text-gray-200 hover:border-emerald-500/40 transition-all shadow-inner"
          >
            <Search className="w-3.5 h-3.5 text-emerald-400" />
            <span className="truncate">Ask anything about CCTV footage... (e.g. &quot;red car at gate&quot;)</span>
            <kbd className="ml-auto text-[10px] font-mono px-1.5 py-0.5 bg-[#202520] text-gray-400 rounded border border-[#2E352E]">
              ⌘K
            </kbd>
          </Link>
        </div>

        {/* Header Right Status Badges */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#181C18] border border-[#262C26] text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-gray-300 font-mono text-[11px]">
              {sysStatus?.backend === "online" ? "SYSTEM ONLINE" : "CONNECTING..."}
            </span>
            {sysStatus?.activeJobs ? (
              <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 rounded-full font-mono">
                {sysStatus.activeJobs} INGESTING
              </span>
            ) : null}
          </div>

          <div className="w-8 h-8 rounded-full bg-[#181C18] border border-[#262C26] flex items-center justify-center text-xs font-mono text-emerald-400 font-bold">
            AI
          </div>
        </div>
      </header>

      <div className="flex flex-1 relative">
        {/* Mobile Sidebar Overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`
            fixed lg:static top-14 bottom-0 left-0 z-50
            bg-[#121512] border-r border-[#1E231E]
            flex flex-col transition-all duration-300 ease-in-out
            ${collapsed ? "w-16" : "w-64"}
            ${mobileOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0"}
          `}
        >
          {/* Nav Items */}
          <div className="flex-1 overflow-y-auto py-4 px-2 space-y-1 scrollbar-none">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all group relative
                    ${
                      isActive
                        ? "bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30 shadow-sm shadow-emerald-500/10"
                        : "text-gray-400 hover:text-gray-200 hover:bg-[#1A1F1A]"
                    }
                  `}
                >
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 transition-transform group-hover:scale-110 ${
                      isActive ? "text-emerald-400" : "text-gray-400 group-hover:text-gray-200"
                    }`}
                  />
                  {!collapsed && <span className="truncate">{item.name}</span>}
                  {!collapsed && item.badge && (
                    <span className="ml-auto text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                      {item.badge}
                    </span>
                  )}

                  {/* Tooltip when collapsed */}
                  {collapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-[#1A1F1A] border border-[#2E352E] text-white text-xs rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                      {item.name}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Sidebar Collapse Toggle (Desktop) */}
          <div className="hidden lg:flex items-center justify-between p-3 border-t border-[#1E231E] text-gray-400">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1.5 rounded-lg hover:bg-[#1A1F1A] hover:text-white transition-colors flex items-center justify-center w-full"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
            </button>
          </div>
        </aside>

        {/* Main Workspace Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#0C0E0C] overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
