import { Terminal, GitCompareArrows, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store";
import { cn } from "@/lib/utils";

export function ViewNav() {
  const activeView = useAppStore((s) => s.activeView);
  const setActiveView = useAppStore((s) => s.setActiveView);

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-background">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setActiveView("commands")}
        className={cn(
          "gap-1.5",
          activeView === "commands" && "bg-accent text-accent-foreground"
        )}
      >
        <Terminal className="size-3.5" />
        Commands
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setActiveView("diff")}
        className={cn(
          "gap-1.5",
          activeView === "diff" && "bg-accent text-accent-foreground"
        )}
      >
        <GitCompareArrows className="size-3.5" />
        Diff
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setActiveView("issue")}
        className={cn(
          "gap-1.5",
          activeView === "issue" && "bg-accent text-accent-foreground"
        )}
      >
        <CircleDot className="size-3.5" />
        Issue
      </Button>
    </div>
  );
}
