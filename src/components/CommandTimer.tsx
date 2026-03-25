import { useEffect, useState } from "react";
import type { CommandInfo } from "@/types";

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function CommandTimer({ command }: { command: CommandInfo }) {
  const startTime = command.started_at || command.created_at;
  const isRunning = command.status === "running" || command.status === "pending";

  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  if (!startTime) return null;

  const endTime = command.completed_at ? new Date(command.completed_at).getTime() : now;
  const elapsed = endTime - new Date(startTime).getTime();

  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {formatElapsed(Math.max(0, elapsed))}
    </span>
  );
}
