import { useEffect } from "react";
import { onCommandEvent } from "@/lib/tauri";
import { executableName } from "@/lib/command";
import { useAppStore } from "@/store";
import type { OutputLine } from "@/types";
import { toast } from "sonner";

const isDev = import.meta.env.DEV;

export function useEventListeners() {
  useEffect(() => {
    // RAF batching for output chunks
    const pendingChunks = new Map<string, OutputLine[]>();
    let flushScheduled = false;

    function scheduleFlush() {
      if (!flushScheduled) {
        flushScheduled = true;
        requestAnimationFrame(() => {
          const store = useAppStore.getState();
          for (const [commandId, lines] of pendingChunks) {
            store.appendOutput(commandId, lines);
          }
          pendingChunks.clear();
          flushScheduled = false;
        });
      }
    }

    const unlistenPromise = onCommandEvent((event) => {
      const store = useAppStore.getState();
      const isKnown = store.commands.has(event.command_id);

      // Skip events for commands not in the store (e.g. from a prior session)
      if (!isKnown) {
        if (isDev) console.debug("[events] skipping unknown command:", event.command_id, event.type);
        return;
      }

      switch (event.type) {
        case "started": {
          if (isDev) console.debug("[events] started:", event.command_id, "pid:", event.pid);

          const existing = store.commands.get(event.command_id)!;
          store.upsertCommand({
            ...existing,
            status: "running",
            exit_code: null,
            pid: event.pid,
            started_at: event.started_at,
            completed_at: null,
          });
          store.initOutputBuffer(event.command_id);
          break;
        }
        case "output": {
          const stream = event.stream === "stderr" ? "stderr" : "stdout";
          const lines: OutputLine[] = event.data
            .split("\n")
            .filter((line) => line.length > 0)
            .map((text) => ({ text, stream }));

          if (lines.length > 0) {
            const existing = pendingChunks.get(event.command_id) || [];
            existing.push(...lines);
            pendingChunks.set(event.command_id, existing);
            scheduleFlush();
          }
          break;
        }
        case "completed": {
          const status = event.exit_code === 0 ? "completed" : "failed";
          if (isDev) console.debug("[events] completed:", event.command_id, "exit:", event.exit_code, "→", status);

          store.updateCommandStatus(
            event.command_id,
            status,
            event.exit_code,
            event.completed_at
          );
          const cmdName = executableName(
            store.commands.get(event.command_id)?.command_line ?? ""
          );
          toast(
            `${cmdName} finished with exit code ${event.exit_code}`,
            {
              action: {
                label: "View",
                onClick: () => store.selectCommand(event.command_id),
              },
            }
          );
          break;
        }
        case "failed": {
          if (isDev) console.warn("[events] failed:", event.command_id, event.error);

          store.updateCommandStatus(
            event.command_id,
            "failed",
            null,
            event.failed_at
          );
          const failedName = executableName(
            store.commands.get(event.command_id)?.command_line ?? ""
          );
          toast.error(`${failedName} failed: ${event.error}`, {
            action: {
              label: "View",
              onClick: () => store.selectCommand(event.command_id),
            },
          });
          break;
        }
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);
}
