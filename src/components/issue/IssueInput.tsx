import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { executeEphemeralCommand } from "@/lib/tauri";
import { useIssueStore, type BeadsIssue } from "@/issueStore";

export function IssueInput() {
  const [value, setValue] = useState("");
  const isLoading = useIssueStore((s) => s.isLoading);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = value.trim();
    if (!id || isLoading) return;

    const store = useIssueStore.getState();
    store.setIssueId(id);
    store.reset();
    store.setIsLoading(true);

    try {
      const result = await executeEphemeralCommand("bd show --json " + id);
      if (result.exit_code === 0) {
        const parsed: BeadsIssue[] = JSON.parse(result.stdout);
        if (parsed.length > 0) {
          store.setIssue(parsed[0]);
        } else {
          store.setError("No issue found for " + id);
        }
      } else {
        store.setError(result.stderr || "Command failed with exit code " + result.exit_code);
      }
    } catch (err) {
      store.setError(err instanceof Error ? err.message : "Failed to run bd show");
    } finally {
      store.setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-b border-border">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Enter issue ID..."
        className="flex-1 font-mono text-sm"
        disabled={isLoading}
      />
      <Button type="submit" size="sm" disabled={isLoading || !value.trim()}>
        Show
      </Button>
    </form>
  );
}
