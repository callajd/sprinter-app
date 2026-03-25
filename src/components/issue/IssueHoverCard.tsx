import type { BeadsRelatedIssue } from "@/issueStore";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CircleDot, CircleCheckBig, CirclePause, CircleX } from "lucide-react";

const statusIcons: Record<string, { icon: typeof CircleDot; color: string }> = {
  open: { icon: CircleDot, color: "text-green-600 dark:text-green-400" },
  in_progress: { icon: CirclePause, color: "text-yellow-600 dark:text-yellow-400" },
  closed: { icon: CircleCheckBig, color: "text-purple-600 dark:text-purple-400" },
  blocked: { icon: CircleX, color: "text-red-600 dark:text-red-400" },
};

const priorityLabels: Record<number, string> = {
  0: "P0",
  1: "P1",
  2: "P2",
  3: "P3",
  4: "P4",
};

const priorityColors: Record<number, string> = {
  0: "bg-red-500/15 text-red-700 dark:text-red-400",
  1: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  2: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  3: "bg-slate-500/15 text-slate-700 dark:text-slate-400",
  4: "bg-slate-500/10 text-slate-500 dark:text-slate-500",
};

interface IssueHoverCardProps {
  issue: BeadsRelatedIssue;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}

export function IssueHoverCard({ issue, children, side = "bottom", align = "start" }: IssueHoverCardProps) {
  const statusConfig = statusIcons[issue.status] ?? { icon: CircleDot, color: "text-muted-foreground" };
  const StatusIconComponent = statusConfig.icon;

  return (
    <HoverCard>
      <HoverCardTrigger render={<div />} className="inline-block">
        {children}
      </HoverCardTrigger>
      <HoverCardContent side={side} align={align} className="w-80">
        <div className="space-y-2.5">
          {/* Header: status icon + id + type + priority */}
          <div className="flex items-center gap-1.5">
            <StatusIconComponent className={cn("size-4 shrink-0", statusConfig.color)} />
            <code className="text-[11px] text-muted-foreground">{issue.id}</code>
            <Badge variant="outline" className="uppercase text-[10px] h-4 px-1">{issue.issue_type}</Badge>
            <Badge className={cn("border-0 uppercase text-[10px] h-4 px-1", priorityColors[issue.priority])}>
              {priorityLabels[issue.priority] ?? `P${issue.priority}`}
            </Badge>
          </div>

          {/* Title */}
          <p className="text-sm font-medium leading-snug">{issue.title}</p>

          {/* Description */}
          {issue.description && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
              {issue.description}
            </p>
          )}

          {/* Footer: assignee + labels */}
          <div className="flex items-center gap-2 flex-wrap">
            {issue.assignee && (
              <span className="text-[11px] text-muted-foreground">{issue.assignee}</span>
            )}
            {issue.labels && issue.labels.length > 0 && (
              <>
                {issue.labels.map((label) => (
                  <Badge key={label} variant="secondary" className="font-mono text-[9px] h-3.5 px-1">
                    {label}
                  </Badge>
                ))}
              </>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
