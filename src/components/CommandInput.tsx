import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { executeCommand } from "@/lib/tauri";
import { useAppStore } from "@/store";

export function CommandInput() {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const selectCommand = useAppStore((s) => s.selectCommand);
  const initOutputBuffer = useAppStore((s) => s.initOutputBuffer);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cmd = value.trim();
    if (!cmd || submitting) return;

    setSubmitting(true);
    try {
      const result = await executeCommand(cmd);
      useAppStore.getState().upsertCommand({
        id: result.command_id,
        command_line: cmd,
        working_directory: "",
        status: "running",
        exit_code: null,
        pid: result.pid,
        started_at: result.started_at,
        completed_at: null,
        created_at: result.started_at ?? new Date().toISOString(),
      });
      initOutputBuffer(result.command_id);
      selectCommand(result.command_id);
      setValue("");
    } catch (err) {
      console.error("Failed to execute command:", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-b border-border">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter command..."
        className="flex-1 font-mono text-sm"
        disabled={submitting}
      />
      <Button type="submit" size="sm" disabled={submitting || !value.trim()}>
        Run
      </Button>
    </form>
  );
}
