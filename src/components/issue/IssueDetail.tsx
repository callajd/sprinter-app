import { useState, useEffect, useCallback } from "react";
import { useIssueStore, type BeadsIssue, type BeadsRelatedIssue } from "@/issueStore";
import { navigateToIssue } from "@/lib/beads";
import { getRepoRoot, getChangedFiles } from "@/lib/git";
import { StackedDiffView } from "@/components/diff/StackedDiffView";
import { useDiffStore } from "@/diffStore";
import { DiffFileList } from "@/components/diff/DiffFileList";
import { DiffEditorPanel } from "@/components/diff/DiffEditorPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { TranscriptTab } from "@/components/issue/TranscriptTab";
import { PanelLeftClose, PanelLeftOpen, Info, MessageSquareText, GitCommit } from "lucide-react";

// --- Helpers ---

function getCommitHash(issue: BeadsIssue): string | null {
  const label = issue.labels?.find((l) => l.startsWith("commit:"));
  return label ? label.slice(7) : null;
}

const priorityLabels: Record<number, string> = {
  0: "P0 Critical",
  1: "P1 High",
  2: "P2 Medium",
  3: "P3 Low",
  4: "P4 Backlog",
};

const priorityColors: Record<number, string> = {
  0: "bg-red-500/15 text-red-700 dark:text-red-400",
  1: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  2: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  3: "bg-slate-500/15 text-slate-700 dark:text-slate-400",
  4: "bg-slate-500/10 text-slate-500 dark:text-slate-500",
};

const statusColors: Record<string, string> = {
  open: "bg-green-500/15 text-green-700 dark:text-green-400",
  in_progress: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  closed: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  blocked: "bg-red-500/15 text-red-700 dark:text-red-400",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// --- Small components ---

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={cn("border-0 uppercase", statusColors[status] ?? "bg-muted text-muted-foreground")}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function TypeBadge({ type }: { type: string }) {
  return <Badge variant="outline" className="uppercase">{type}</Badge>;
}

function PriorityBadge({ priority }: { priority: number }) {
  return (
    <Badge className={cn("border-0 uppercase", priorityColors[priority] ?? "bg-muted text-muted-foreground")}>
      {priorityLabels[priority] ?? `P${priority}`}
    </Badge>
  );
}

function MetadataRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-xs text-muted-foreground w-20 shrink-0 text-right">{label}</span>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

function RelatedIssueRow({ issue }: { issue: BeadsRelatedIssue }) {
  return (
    <button
      onClick={() => navigateToIssue(issue.id)}
      className="w-full flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left cursor-pointer"
    >
      <StatusBadge status={issue.status} />
      <code className="text-xs text-muted-foreground shrink-0">{issue.id}</code>
      <span className="text-sm truncate">{issue.title}</span>
      {issue.dependency_type !== "parent-child" && (
        <span className="text-xs text-muted-foreground ml-auto shrink-0">{issue.dependency_type}</span>
      )}
    </button>
  );
}

// --- Details tab ---

function DetailsTab({ issue }: { issue: BeadsIssue }) {
  const hasLabels = issue.labels && issue.labels.length > 0;
  const hasDependencies = issue.dependencies && issue.dependencies.length > 0;
  const hasDependents = issue.dependents && issue.dependents.length > 0;

  return (
    <div className="space-y-6">
      {/* Description */}
      {issue.description && (
        <div className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-md p-4 border border-border/50">
          {issue.description}
        </div>
      )}

      {/* Metadata */}
      <div className="space-y-1.5 border-l-2 border-border pl-4">
        {issue.assignee && <MetadataRow label="Assignee">{issue.assignee}</MetadataRow>}
        {issue.created_by && <MetadataRow label="Created by">{issue.created_by}</MetadataRow>}
        <MetadataRow label="Created">{formatDate(issue.created_at)}</MetadataRow>
        <MetadataRow label="Updated">{formatDate(issue.updated_at)}</MetadataRow>
        {issue.closed_at && (
          <MetadataRow label="Closed">
            {formatDate(issue.closed_at)}
            {issue.close_reason && <span className="text-muted-foreground ml-1">({issue.close_reason})</span>}
          </MetadataRow>
        )}
        {issue.parent && (
          <MetadataRow label="Parent">
            <button onClick={() => navigateToIssue(issue.parent!)} className="cursor-pointer hover:underline">
              <code className="text-xs">{issue.parent}</code>
            </button>
          </MetadataRow>
        )}
      </div>

      {/* Labels */}
      {hasLabels && (
        <Section title="Labels">
          <div className="flex gap-1.5 flex-wrap">
            {issue.labels!.map((label) => (
              <Badge key={label} variant="secondary" className="font-mono text-xs">
                {label}
              </Badge>
            ))}
          </div>
        </Section>
      )}

      {/* Notes */}
      {issue.notes && (
        <Section title="Notes">
          <div className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-md p-4 border border-border/50">
            {issue.notes}
          </div>
        </Section>
      )}

      {/* Design */}
      {issue.design && (
        <Section title="Design">
          <div className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-md p-4 border border-border/50">
            {issue.design}
          </div>
        </Section>
      )}

      {/* Acceptance Criteria */}
      {issue.acceptance && (
        <Section title="Acceptance Criteria">
          <div className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-md p-4 border border-border/50">
            {issue.acceptance}
          </div>
        </Section>
      )}

      {/* Dependencies */}
      {hasDependencies && (
        <Section title="Dependencies">
          <div className="space-y-0.5">
            {issue.dependencies!.map((dep) => (
              <RelatedIssueRow key={dep.id} issue={dep} />
            ))}
          </div>
        </Section>
      )}

      {/* Dependents */}
      {hasDependents && (
        <Section title="Dependents">
          <div className="space-y-0.5">
            {issue.dependents!.map((dep) => (
              <RelatedIssueRow key={dep.id} issue={dep} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// --- Commit tab ---

function CommitTab({ commitHash }: { commitHash: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loaded, setLoaded] = useState<string | null>(null);
  const isLoadingFiles = useDiffStore((s) => s.isLoadingFiles);
  const error = useDiffStore((s) => s.error);
  const repoPath = useDiffStore((s) => s.repoPath);
  const sourceBranch = useDiffStore((s) => s.sourceBranch);
  const targetBranch = useDiffStore((s) => s.targetBranch);

  const loadDiff = useCallback(async (hash: string) => {
    const diffStore = useDiffStore.getState();
    diffStore.setError(null);
    diffStore.setFiles([]);
    diffStore.selectFile(null);
    diffStore.setIsLoadingFiles(true);

    try {
      const repoPath = await getRepoRoot();
      const source = hash + "~1";
      const target = hash;

      diffStore.setRepoPath(repoPath);
      diffStore.setSourceBranch(source);
      diffStore.setTargetBranch(target);

      const files = await getChangedFiles(repoPath, source, target);
      diffStore.setFiles(files);
      setLoaded(hash);
    } catch (err) {
      diffStore.setError(err instanceof Error ? err.message : "Failed to load commit diff");
    } finally {
      diffStore.setIsLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    if (commitHash !== loaded) {
      loadDiff(commitHash);
    }
  }, [commitHash, loaded, loadDiff]);

  if (isLoadingFiles) {
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

  return (
    <div className="flex flex-1 min-h-0">
      {sidebarOpen && (
        <div className="w-64 border-r border-border flex flex-col min-h-0">
          <div className="px-2 py-1 border-b border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono">{commitHash}</span>
            <Button variant="ghost" size="icon-xs" onClick={() => setSidebarOpen(false)} title="Collapse file tree">
              <PanelLeftClose className="size-3.5" />
            </Button>
          </div>
          <DiffFileList />
        </div>
      )}
      {sidebarOpen ? (
        <div className="flex-1 flex flex-col min-h-0">
          <DiffEditorPanel />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-2 py-1 border-b border-border">
            <Button variant="ghost" size="icon-xs" onClick={() => setSidebarOpen(true)} title="Expand file tree">
              <PanelLeftOpen className="size-3.5" />
            </Button>
          </div>
          {repoPath && sourceBranch && targetBranch && (
            <StackedDiffView repoPath={repoPath} source={sourceBranch} target={targetBranch} />
          )}
        </div>
      )}
    </div>
  );
}

// --- Main component ---

function IssueContent({ issue }: { issue: BeadsIssue }) {
  const commitHash = getCommitHash(issue);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="p-6 pb-0 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-sm text-muted-foreground">{issue.id}</code>
          <StatusBadge status={issue.status} />
          <TypeBadge type={issue.issue_type} />
          <PriorityBadge priority={issue.priority} />
        </div>
        <h1 className="text-xl font-semibold leading-tight">{issue.title}</h1>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details" className="flex-1 min-h-0 flex flex-col mt-4">
        <div className="px-6">
          <TabsList>
            <TabsTrigger value="details" className="px-4"><Info className="size-3.5" />Details</TabsTrigger>
            <TabsTrigger value="transcript" className="px-4"><MessageSquareText className="size-3.5" />Transcript</TabsTrigger>
            <TabsTrigger value="commit" className="px-4" disabled={!commitHash}><GitCommit className="size-3.5" />Commit</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="details" className="flex-1 min-h-0 overflow-auto p-6">
          <DetailsTab issue={issue} />
        </TabsContent>
        <TabsContent value="transcript" className="flex-1 min-h-0 overflow-auto p-6">
          <TranscriptTab />
        </TabsContent>
        <TabsContent value="commit" className="flex-1 min-h-0 flex flex-col p-6">
          {commitHash && <CommitTab commitHash={commitHash} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function IssueDetail() {
  const issue = useIssueStore((s) => s.issue);
  const error = useIssueStore((s) => s.error);
  const isLoading = useIssueStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Loading issue...</p>
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

  if (issue) {
    return <IssueContent issue={issue} />;
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-muted-foreground">Enter an issue ID to view details</p>
    </div>
  );
}
