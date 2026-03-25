import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DiffFile } from "@/lib/git";

interface Props {
  file: DiffFile;
  selected: boolean;
  onSelect: () => void;
}

const STATUS_CONFIG: Record<
  DiffFile["status"],
  { label: string; className: string }
> = {
  A: { label: "A", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  M: { label: "M", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  D: { label: "D", className: "bg-red-500/15 text-red-600 dark:text-red-400" },
  R: { label: "R", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  C: { label: "C", className: "bg-purple-500/15 text-purple-600 dark:text-purple-400" },
  T: { label: "T", className: "bg-gray-500/15 text-gray-600 dark:text-gray-400" },
  U: { label: "U", className: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
};

export const DiffFileListItem = memo(function DiffFileListItem({
  file,
  selected,
  onSelect,
}: Props) {
  const parts = file.path.split("/");
  const fileName = parts.pop() ?? file.path;
  const dir = parts.join("/");
  const config = STATUS_CONFIG[file.status];

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left px-3 py-2 border-b border-border hover:bg-accent transition-colors",
        selected && "bg-accent"
      )}
    >
      <div className="flex items-center gap-2">
        <Badge className={cn("text-[10px] shrink-0 font-mono", config.className)}>
          {config.label}
        </Badge>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm truncate text-foreground">{fileName}</p>
          {dir && (
            <p className="font-mono text-xs truncate text-muted-foreground">
              {dir}
            </p>
          )}
        </div>
      </div>
    </button>
  );
});
