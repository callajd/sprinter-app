import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommandListItem } from "@/components/CommandListItem";
import { useAppStore } from "@/store";

export function CommandList() {
  const commands = useAppStore((s) => s.commands);
  const selectedCommandId = useAppStore((s) => s.selectedCommandId);
  const selectCommand = useAppStore((s) => s.selectCommand);

  const sortedCommands = useMemo(() => {
    const arr = Array.from(commands.values());
    // Running commands first, then by created_at descending
    arr.sort((a, b) => {
      if (a.status === "running" && b.status !== "running") return -1;
      if (a.status !== "running" && b.status === "running") return 1;
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
    return arr;
  }, [commands]);

  if (sortedCommands.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">No commands yet</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      {sortedCommands.map((cmd) => (
        <CommandListItem
          key={cmd.id}
          command={cmd}
          selected={cmd.id === selectedCommandId}
          onSelect={() => selectCommand(cmd.id)}
        />
      ))}
    </ScrollArea>
  );
}
