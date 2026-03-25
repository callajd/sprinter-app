import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { killCommand } from "@/lib/tauri";
import { executableName, commandBadgeColor, commandBadgeLabel } from "@/lib/command";
import { CommandTimer } from "@/components/CommandTimer";
import type { CommandInfo } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  command: CommandInfo;
}

export function CommandHeader({ command }: Props) {
  async function handleKill() {
    try {
      await killCommand(command.id);
    } catch (err) {
      console.error("Failed to kill command:", err);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 p-4 border-b border-border">
      <div className="flex-1 min-w-0">
        <p className="font-mono text-lg font-semibold">{executableName(command.command_line)}</p>
        <div className="flex items-center gap-2 mt-2">
          <Badge className={cn("text-xs", commandBadgeColor(command))}>
            {commandBadgeLabel(command)}
          </Badge>
          <CommandTimer command={command} />
          {command.status === "running" && command.pid && (
            <span className="text-xs text-muted-foreground">
              PID {command.pid}
            </span>
          )}
        </div>
      </div>
      {command.status === "running" && (
        <Button variant="destructive" size="sm" onClick={handleKill}>
          Kill
        </Button>
      )}
    </div>
  );
}
