import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useAppStore } from "@/store";
import { getCommandOutput } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { displayCommandLine, commandDirectory } from "@/lib/command";
import type { OutputLine } from "@/types";

interface Props {
  commandId: string;
  commandLine?: string;
  workingDirectory?: string;
}

export function CommandOutput({ commandId, commandLine, workingDirectory }: Props) {
  const buffer = useAppStore((s) => s.outputBuffers.get(commandId));
  const lines = buffer?.lines || [];
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const fetchedRef = useRef<string | null>(null);

  // Fetch historical output if buffer is empty
  useEffect(() => {
    if (fetchedRef.current === commandId) return;
    if (buffer && buffer.lines.length > 0) return;

    fetchedRef.current = commandId;
    getCommandOutput(commandId)
      .then((chunks) => {
        if (chunks.length === 0) return;
        const outputLines: OutputLine[] = chunks.flatMap((chunk) =>
          chunk.data
            .split("\n")
            .filter((line) => line.length > 0)
            .map((text) => ({
              text,
              stream: (chunk.stream === "stderr" ? "stderr" : "stdout") as "stdout" | "stderr",
            }))
        );
        if (outputLines.length > 0) {
          const store = useAppStore.getState();
          store.initOutputBuffer(commandId);
          store.appendOutput(commandId, outputLines);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch command output:", err);
      });
  }, [commandId, buffer]);

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 20,
    overscan: 20,
  });

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (shouldAutoScroll.current && lines.length > 0) {
      virtualizer.scrollToIndex(lines.length - 1, { align: "end" });
    }
  }, [buffer?.version, lines.length, virtualizer]);

  function handleScroll() {
    const el = parentRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    shouldAutoScroll.current = atBottom;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <div
        ref={parentRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-muted rounded-md p-2 font-mono text-sm border border-border"
      >
        {commandLine && (() => {
          const dir = commandDirectory(commandLine, workingDirectory ?? "");
          return (
            <>
              {dir && (
                <div className="px-2 leading-5 whitespace-pre-wrap break-all text-muted-foreground">
                  {dir}
                </div>
              )}
              <div className="px-2 leading-5 whitespace-pre-wrap break-all text-muted-foreground">
                <span className="text-muted-foreground/60 select-none">$ </span>{displayCommandLine(commandLine)}
              </div>
            </>
          );
        })()}
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const line = lines[virtualRow.index];
            return (
              <div
                key={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={cn(
                  "px-2 leading-5 whitespace-pre-wrap break-all",
                  line.stream === "stderr"
                    ? "text-status-failed"
                    : "text-foreground"
                )}
              >
                {line.text}
              </div>
            );
          })}
        </div>
      </div>
      {!shouldAutoScroll.current && lines.length > 0 && (
        <button
          onClick={() => {
            shouldAutoScroll.current = true;
            virtualizer.scrollToIndex(lines.length - 1, { align: "end" });
          }}
          className="absolute bottom-4 right-4 bg-primary text-primary-foreground px-3 py-1 rounded text-xs"
        >
          Jump to bottom
        </button>
      )}
    </div>
  );
}
