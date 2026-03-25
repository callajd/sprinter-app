import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { CommandInput } from "@/components/CommandInput";
import { CommandList } from "@/components/CommandList";
import { CommandDetail } from "@/components/CommandDetail";
import { ViewNav } from "@/components/ViewNav";
import { DiffViewer } from "@/components/diff/DiffViewer";
import { IssueViewer } from "@/components/issue/IssueViewer";
import { useEventListeners } from "@/hooks/useEventListeners";
import { useAppStore } from "@/store";
import { listCommands } from "@/lib/tauri";
import { TooltipProvider } from "@/components/ui/tooltip";

function App() {
  useEventListeners();
  const activeView = useAppStore((s) => s.activeView);

  // Load existing commands on mount
  useEffect(() => {
    listCommands()
      .then((commands) => {
        useAppStore.getState().setCommands(commands);
      })
      .catch((err) => {
        console.error("Failed to load commands:", err);
      });

    // Dismiss splash screen
    const splash = document.getElementById("splash");
    if (splash) {
      splash.classList.add("hidden");
    }
  }, []);

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col bg-background text-foreground">
        <ViewNav />
        <div className="flex-1 flex min-h-0">
          {activeView === "commands" && (
            <>
              {/* Sidebar */}
              <div className="w-80 border-r border-border flex flex-col">
                <CommandInput />
                <CommandList />
              </div>

              {/* Main panel */}
              <div className="flex-1 flex flex-col min-h-0">
                <CommandDetail />
              </div>
            </>
          )}
          {activeView === "diff" && <DiffViewer />}
          {activeView === "issue" && <IssueViewer />}
        </div>

        <Toaster position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}

export default App;
