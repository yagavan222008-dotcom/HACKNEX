"use client";

import React from "react";
import AppShell from "@/components/layout/AppShell";
import { AnalyticsCharts } from "@/components/analytics/analytics-charts";
import { BarChart3 } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <AppShell>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full font-mono">
        <div className="border-b border-[#1E231E] pb-5">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <h1 className="text-xl font-bold text-white tracking-tight font-mono">
              System Analytics & Stream Telemetry
            </h1>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Real-time analytics for video ingestion rate, object detection density, and system performance metrics.
          </p>
        </div>

        <AnalyticsCharts />
      </div>
    </AppShell>
  );
}
