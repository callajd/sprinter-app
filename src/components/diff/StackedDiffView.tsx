import { useEffect, useState } from "react";
import { getUnifiedDiff } from "@/lib/git";
import { cn } from "@/lib/utils";

interface FileDiff {
  header: string;
  path: string;
  hunks: string[];
}

function parseDiff(raw: string): FileDiff[] {
  const files: FileDiff[] = [];
  const lines = raw.split("\n");
  let i = 0;

  while (i < lines.length) {
    // Find next file header
    if (lines[i].startsWith("diff --git")) {
      const header = lines[i];
      // Extract path from "diff --git a/path b/path"
      const match = header.match(/diff --git a\/.+ b\/(.+)/);
      const path = match?.[1] ?? "";

      // Collect all lines until next "diff --git" or end
      const hunkLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("diff --git")) {
        hunkLines.push(lines[i]);
        i++;
      }
      files.push({ header, path, hunks: hunkLines });
    } else {
      i++;
    }
  }

  return files;
}

function DiffLine({ line }: { line: string }) {
  if (line.startsWith("@@")) {
    return (
      <div className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-3 py-0.5 font-mono">
        {line}
      </div>
    );
  }
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return (
      <div className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 px-3 font-mono whitespace-pre-wrap">
        {line}
      </div>
    );
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return (
      <div className="text-xs bg-red-500/10 text-red-700 dark:text-red-400 px-3 font-mono whitespace-pre-wrap">
        {line}
      </div>
    );
  }
  if (line.startsWith("---") || line.startsWith("+++")) {
    return null; // Skip file markers, we show our own header
  }
  if (line.startsWith("index ") || line.startsWith("new file") || line.startsWith("deleted file") || line.startsWith("old mode") || line.startsWith("new mode") || line.startsWith("similarity") || line.startsWith("rename") || line.startsWith("Binary")) {
    return (
      <div className="text-xs text-muted-foreground px-3 font-mono">
        {line}
      </div>
    );
  }
  return (
    <div className="text-xs px-3 font-mono whitespace-pre-wrap">
      {line}
    </div>
  );
}

function FileSection({ file }: { file: FileDiff }) {
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="sticky top-0 z-10 bg-muted px-3 py-1.5 border-b border-border">
        <span className="text-xs font-mono font-medium">{file.path}</span>
      </div>
      <div className="leading-5">
        {file.hunks.map((line, i) => (
          <DiffLine key={i} line={line} />
        ))}
      </div>
    </div>
  );
}

interface StackedDiffViewProps {
  repoPath: string;
  source: string;
  target: string;
}

export function StackedDiffView({ repoPath, source, target }: StackedDiffViewProps) {
  const [files, setFiles] = useState<FileDiff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getUnifiedDiff(repoPath, source, target)
      .then((raw) => {
        if (cancelled) return;
        setFiles(parseDiff(raw));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load diff");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [repoPath, source, target]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading diff...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-4">
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
          <pre className="font-mono text-sm text-destructive whitespace-pre-wrap">{error}</pre>
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">No changes</p>
      </div>
    );
  }

  return (
    <div className={cn("flex-1 overflow-auto space-y-4")}>
      {files.map((file, i) => (
        <FileSection key={i} file={file} />
      ))}
    </div>
  );
}
