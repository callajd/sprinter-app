import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { IssueViewer } from "@/components/issue/IssueViewer";
import { TooltipProvider } from "@/components/ui/tooltip";

function App() {
  useEffect(() => {
    // Dismiss splash screen
    const splash = document.getElementById("splash");
    if (splash) {
      splash.classList.add("hidden");
    }
  }, []);

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col bg-background text-foreground">
        <div className="flex-1 flex min-h-0">
          <IssueViewer />
        </div>
        <Toaster position="bottom-right" />
      </div>
    </TooltipProvider>
  );
}

export default App;
