import { useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useIssueStore } from "@/issueStore";
import { navigateToIssue, loadIssues } from "@/lib/beads";
import { cn } from "@/lib/utils";

const priorityColors: Record<number, string> = {
  0: "bg-red-500/15 text-red-700 dark:text-red-400",
  1: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  2: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  3: "bg-slate-500/15 text-slate-700 dark:text-slate-400",
  4: "bg-slate-500/10 text-slate-500 dark:text-slate-500",
};

const typeIcons: Record<string, string> = {
  feature: "F",
  task: "T",
  bug: "B",
};

export function IssueList() {
  const [showAll, setShowAll] = useState(false);
  const issuesList = useIssueStore((s) => s.issuesList);
  const isLoadingList = useIssueStore((s) => s.isLoadingList);
  const selectedIssueId = useIssueStore((s) => s.issue?.id);

  useEffect(() => {
    loadIssues(showAll);
  }, [showAll]);

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Checkbox
          checked={showAll}
          onCheckedChange={(checked) => setShowAll(checked === true)}
        />
        <label
          className="text-xs text-muted-foreground cursor-pointer select-none"
          onClick={() => setShowAll(!showAll)}
        >
          Show all
        </label>
      </div>

      {isLoadingList && issuesList.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-muted-foreground">Loading issues...</p>
        </div>
      ) : issuesList.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-muted-foreground">
            {showAll ? "No issues" : "No open issues"}
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          {issuesList.map((issue) => (
            <button
              key={issue.id}
              onClick={() => navigateToIssue(issue.id)}
              className={cn(
                "w-full text-left px-3 py-2 border-b border-border hover:bg-accent/50 transition-colors cursor-pointer",
                selectedIssueId === issue.id && "bg-accent"
              )}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <Badge
                  variant="outline"
                  className={cn("h-4 px-1 text-[10px] font-semibold border-0", priorityColors[issue.priority])}
                >
                  {typeIcons[issue.issue_type] ?? issue.issue_type[0]?.toUpperCase()}
                </Badge>
                <code className="text-[11px] text-muted-foreground truncate">{issue.id}</code>
              </div>
              <p className="text-sm truncate">{issue.title}</p>
              {issue.assignee && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">{issue.assignee}</p>
              )}
            </button>
          ))}
        </ScrollArea>
      )}
    </>
  );
}
