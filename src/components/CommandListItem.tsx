import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { executableName, commandBadgeColor, commandBadgeLabel } from "@/lib/command";
import type { CommandInfo } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  command: CommandInfo;
  selected: boolean;
  onSelect: () => void;
}

export const CommandListItem = memo(function CommandListItem({
  command,
  selected,
  onSelect,
}: Props) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left p-3 border-b border-border hover:bg-accent transition-colors",
        selected && "bg-accent"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-sm truncate text-foreground">
          {executableName(command.command_line)}
        </p>
        <Badge className={cn("text-xs shrink-0", commandBadgeColor(command))}>
          {commandBadgeLabel(command)}
        </Badge>
      </div>
    </button>
  );
});
