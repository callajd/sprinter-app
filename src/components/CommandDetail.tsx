import { useAppStore } from "@/store";
import { CommandHeader } from "@/components/CommandHeader";
import { CommandOutput } from "@/components/CommandOutput";

export function CommandDetail() {
  const selectedId = useAppStore((s) => s.selectedCommandId);
  const command = useAppStore((s) =>
    s.selectedCommandId ? s.commands.get(s.selectedCommandId) : undefined
  );

  if (!selectedId || !command) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Select a command to view output</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <CommandHeader command={command} />
      <div className="flex-1 p-4 min-h-0 flex flex-col">
        <CommandOutput commandId={selectedId} commandLine={command.command_line} workingDirectory={command.working_directory} />
      </div>
    </div>
  );
}
