import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useDiffStore } from "@/diffStore";
import { validateRepo, getChangedFiles } from "@/lib/git";

const isDev = import.meta.env.DEV;

export function DiffConfig() {
  const {
    repoPath,
    sourceBranch,
    targetBranch,
    isLoadingFiles,
    error,
    setRepoPath,
    setSourceBranch,
    setTargetBranch,
    setFiles,
    setIsLoadingFiles,
    setError,
  } = useDiffStore();

  const [localError, setLocalError] = useState<string | null>(null);
  const displayError = localError ?? error;

  async function handleCompare(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setError(null);

    if (!repoPath.trim() || !sourceBranch.trim() || !targetBranch.trim()) {
      setLocalError("All fields are required");
      return;
    }

    if (isDev) console.debug("[diff] comparing:", { repoPath: repoPath.trim(), sourceBranch: sourceBranch.trim(), targetBranch: targetBranch.trim() });

    setIsLoadingFiles(true);
    try {
      const valid = await validateRepo(repoPath.trim());
      if (!valid) {
        if (isDev) console.warn("[diff] repo validation failed for:", repoPath.trim());
        setLocalError("Not a valid git repository");
        return;
      }

      if (isDev) console.debug("[diff] repo valid, fetching changed files...");

      const files = await getChangedFiles(
        repoPath.trim(),
        sourceBranch.trim(),
        targetBranch.trim()
      );

      if (isDev) console.debug("[diff] found", files.length, "changed files:", files);

      setFiles(files);
    } catch (err) {
      if (isDev) console.error("[diff] compare error:", err);
      setLocalError(
        err instanceof Error ? err.message : "Failed to load diff"
      );
    } finally {
      setIsLoadingFiles(false);
    }
  }

  return (
    <form onSubmit={handleCompare} className="flex flex-col gap-2 p-3 border-b border-border">
      <Input
        value={repoPath}
        onChange={(e) => setRepoPath(e.target.value)}
        placeholder="Repository path"
        className="font-mono text-sm"
      />
      <div className="flex gap-2">
        <Input
          value={sourceBranch}
          onChange={(e) => setSourceBranch(e.target.value)}
          placeholder="Source (e.g. main)"
          className="flex-1 font-mono text-sm"
        />
        <Input
          value={targetBranch}
          onChange={(e) => setTargetBranch(e.target.value)}
          placeholder="Target (e.g. feat/...)"
          className="flex-1 font-mono text-sm"
        />
      </div>
      <Button type="submit" size="sm" disabled={isLoadingFiles}>
        {isLoadingFiles ? "Loading..." : "Compare"}
      </Button>
      {displayError && (
        <p className="text-xs text-destructive">{displayError}</p>
      )}
    </form>
  );
}
