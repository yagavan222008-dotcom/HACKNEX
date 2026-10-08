"use client";

import { useState } from "react";
import AppShell from "@/components/layout/AppShell";
import { ConversationSidebar } from "@/components/conversation/conversation-sidebar";
import { ChatInterface } from "@/components/conversation/chat-interface";
import { AISteps } from "@/components/conversation/ai-steps";
import type { ProcessingStep } from "@/lib/api";

export default function ConversationPage() {
  const [showSteps, setShowSteps] = useState(false);
  const [currentSteps, setCurrentSteps] = useState<ProcessingStep[] | undefined>(undefined);
  const [responseTime, setResponseTime] = useState<number | undefined>(undefined);

  return (
    <AppShell>
      <div className="p-4 sm:p-6 lg:p-8 flex flex-col md:flex-row gap-4 h-[calc(100vh-5rem)] max-w-7xl mx-auto w-full font-mono">
        <ConversationSidebar />
        <div className="flex-1 bg-[#151815] border border-[#1E231E] rounded-xl overflow-hidden flex flex-col min-w-0 shadow-lg">
          <ChatInterface 
            onShowSteps={() => setShowSteps(!showSteps)} 
            onStepsUpdate={(steps, time) => {
              setCurrentSteps(steps);
              setResponseTime(time);
            }}
          />
        </div>
        {showSteps && <AISteps steps={currentSteps} responseTime={responseTime} />}
      </div>
    </AppShell>
  );
}
