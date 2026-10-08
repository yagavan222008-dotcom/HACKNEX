"use client";

import { useState, useEffect } from "react";
import AppShell from "@/components/layout/AppShell";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { useTheme } from "next-themes";
import { Moon, Sun, Monitor, Settings as SettingsIcon } from "lucide-react";
import "./settings.css";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("user");
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <AppShell>
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full font-mono">
        <div className="border-b border-[#1E231E] pb-5">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-emerald-400" />
            <h1 className="text-xl font-bold text-white tracking-tight font-mono">
              System Settings & Configuration
            </h1>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Configure indexing mode, LLM credentials, and SPECTRA system options.
          </p>
        </div>

        {/* Appearance island */}
        <div className="settings-appearance-card bg-[#151815] border border-[#1E231E] rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="settings-appearance-title text-sm font-bold text-white">Appearance</p>
            <p className="settings-appearance-subtitle text-xs text-gray-400">
              Choose your preferred interface theme
            </p>
          </div>

          <div className="settings-theme-picker flex items-center gap-1 bg-[#101210] p-1 rounded-lg border border-[#1E231E]">
            {[
              { value: "light", label: "Light", icon: Sun },
              { value: "system", label: "System", icon: Monitor },
              { value: "dark", label: "Dark", icon: Moon },
            ].map(({ value, label, icon: Icon }) => {
              const isActive = mounted && theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  className={`theme-button flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-colors ${
                    isActive ? "bg-emerald-500 text-stone-950 font-bold" : "text-gray-400 hover:text-white"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <SettingsTabs activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </AppShell>
  );
}
