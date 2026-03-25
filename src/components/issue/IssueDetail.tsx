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
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { TranscriptTab } from "@/components/issue/TranscriptTab";
import { IssueHoverCard } from "@/components/issue/IssueHoverCard";
import { PanelLeftClose, PanelLeftOpen, Info, MessageSquareText, GitCommit, CircleDot, CircleCheckBig, CirclePause, CircleX } from "lucide-react";

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function Timeline({ events }: { events: { label: string; date: string; color: string }[] }) {
  return (
    <div className="relative pl-5">
      {/* Vertical line */}
      <div className="absolute left-[9px] top-2 bottom-2 w-0.5 bg-border rounded-full" />
      <div className="space-y-3">
        {events.map((event, i) => (
          <HoverCard key={i}>
            <HoverCardTrigger render={<div />} className="relative flex items-center cursor-default">
              <div className={cn("absolute left-[-15px] size-2.5 rounded-full", event.color)} />
              <span className="text-sm">{formatDate(event.date)}</span>
            </HoverCardTrigger>
            <HoverCardContent side="left" align="center" className="w-auto">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className={cn("size-2 rounded-full", event.color)} />
                  <span className="text-xs font-semibold uppercase tracking-wider">{event.label}</span>
                </div>
                <p className="text-sm font-mono">{formatDateTime(event.date)}</p>
              </div>
            </HoverCardContent>
          </HoverCard>
        ))}
      </div>
    </div>
  );
}

// --- Small components ---

const statusIcons: Record<string, { icon: typeof CircleDot; color: string }> = {
  open: { icon: CircleDot, color: "text-green-600 dark:text-green-400" },
  in_progress: { icon: CirclePause, color: "text-yellow-600 dark:text-yellow-400" },
  closed: { icon: CircleCheckBig, color: "text-purple-600 dark:text-purple-400" },
  blocked: { icon: CircleX, color: "text-red-600 dark:text-red-400" },
};

function StatusIcon({ status }: { status: string }) {
  const config = statusIcons[status] ?? { icon: CircleDot, color: "text-muted-foreground" };
  const Icon = config.icon;
  return <Icon className={cn("size-5", config.color)} />;
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

function SidebarField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2 border-b border-border/50">
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
      <div>{children}</div>
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
    <IssueHoverCard issue={issue}>
      <button
        onClick={() => navigateToIssue(issue.id)}
        className="w-full flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors text-left cursor-pointer"
      >
        <StatusIcon status={issue.status} />
        <code className="text-xs text-muted-foreground shrink-0">{issue.id}</code>
        <span className="text-sm truncate">{issue.title}</span>
      </button>
    </IssueHoverCard>
  );
}

// --- Details tab ---

function DetailsTab({ issue }: { issue: BeadsIssue }) {
  const hasLabels = issue.labels && issue.labels.length > 0;
  const filteredDeps = issue.dependencies?.filter((dep) => dep.id !== issue.parent) ?? [];
  const hasDependencies = filteredDeps.length > 0;
  const children = issue.dependents?.filter((dep) => dep.dependency_type === "parent-child") ?? [];
  const dependents = issue.dependents?.filter((dep) => dep.dependency_type !== "parent-child") ?? [];
  const hasChildren = children.length > 0;
  const hasDependents = dependents.length > 0;

  return (
    <div className="flex gap-6 min-h-0">
      {/* Left column — description & long-form content */}
      <div className="flex-1 min-w-0 space-y-6">
        {issue.description && (
          <div className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-md p-4 border border-border/50">
            {issue.description}
          </div>
        )}

        {hasDependencies && (
          <Section title="Dependencies">
            <div className="space-y-0.5">
              {filteredDeps.map((dep) => (
                <RelatedIssueRow key={dep.id} issue={dep} />
              ))}
            </div>
          </Section>
        )}

        {hasChildren && (
          <Section title="Children">
            <div className="space-y-0.5">
              {children.map((dep) => (
                <RelatedIssueRow key={dep.id} issue={dep} />
              ))}
            </div>
          </Section>
        )}

        {hasDependents && (
          <Section title="Dependents">
            <div className="space-y-0.5">
              {dependents.map((dep) => (
                <RelatedIssueRow key={dep.id} issue={dep} />
              ))}
            </div>
          </Section>
        )}

        {issue.notes && (
          <Section title="Notes">
            <div className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-md p-4 border border-border/50">
              {issue.notes}
            </div>
          </Section>
        )}

        {issue.design && (
          <Section title="Design">
            <div className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-md p-4 border border-border/50">
              {issue.design}
            </div>
          </Section>
        )}

        {issue.acceptance && (
          <Section title="Acceptance Criteria">
            <div className="text-sm leading-relaxed whitespace-pre-wrap bg-muted/40 rounded-md p-4 border border-border/50">
              {issue.acceptance}
            </div>
          </Section>
        )}
      </div>

      {/* Right column — sidebar details */}
      <div className="w-64 shrink-0 space-y-0.5">
        <SidebarField label="Priority"><PriorityBadge priority={issue.priority} /></SidebarField>
        {issue.assignee && <SidebarField label="Assignee"><span className="text-sm">{issue.assignee}</span></SidebarField>}
        {issue.created_by && <SidebarField label="Created by"><span className="text-sm">{issue.created_by}</span></SidebarField>}
        <SidebarField label="Timeline">
          <Timeline events={[
            { label: "Created", date: issue.created_at, color: "bg-green-600 dark:bg-green-400" },
            { label: "Updated", date: issue.updated_at, color: "bg-green-600 dark:bg-green-400" },
            ...(issue.closed_at ? [{ label: "Closed", date: issue.closed_at, color: "bg-purple-600 dark:bg-purple-400" }] : []),
          ]} />
        </SidebarField>
        {issue.parent && (
          <SidebarField label="Parent">
            {(() => {
              const parentDep = issue.dependencies?.find((d) => d.id === issue.parent);
              if (parentDep) {
                return (
                  <IssueHoverCard issue={parentDep} side="left">
                    <button onClick={() => navigateToIssue(issue.parent!)} className="cursor-pointer hover:underline text-left">
                      <code className="text-xs text-muted-foreground">{issue.parent}</code>
                      <p className="text-sm mt-0.5">{parentDep.title}</p>
                    </button>
                  </IssueHoverCard>
                );
              }
              return (
                <button onClick={() => navigateToIssue(issue.parent!)} className="cursor-pointer hover:underline">
                  <code className="text-xs text-muted-foreground">{issue.parent}</code>
                </button>
              );
            })()}
          </SidebarField>
        )}
        {hasLabels && (
          <SidebarField label="Labels">
            <div className="flex gap-1 flex-wrap">
              {issue.labels!.map((label) => (
                <Badge key={label} variant="secondary" className="font-mono text-[10px]">
                  {label}
                </Badge>
              ))}
            </div>
          </SidebarField>
        )}
      </div>
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
          <TypeBadge type={issue.issue_type} />
        </div>
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold leading-tight">{issue.title}</h1>
          <StatusIcon status={issue.status} />
        </div>
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
