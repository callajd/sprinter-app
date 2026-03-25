import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useIssueStore } from "@/issueStore";
import { navigateToIssue } from "@/lib/beads";

export function IssueInput() {
  const [value, setValue] = useState("");
  const isLoading = useIssueStore((s) => s.isLoading);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = value.trim();
    if (!id || isLoading) return;
    await navigateToIssue(id);
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
