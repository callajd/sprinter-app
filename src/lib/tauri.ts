import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { CommandEvent, CommandInfo } from "@/types";

const isDev = import.meta.env.DEV;

export interface ExecuteCommandResult {
  command_id: string;
  pid: number | null;
  started_at: string | null;
}

export async function executeCommand(
  commandLine: string,
  workingDirectory: string = ""
): Promise<ExecuteCommandResult> {
  if (isDev) console.debug("[tauri] executeCommand:", { commandLine, workingDirectory });
  const result = await invoke<ExecuteCommandResult>("execute_command", {
    spec: {
      type: "shell",
      command_line: commandLine,
      working_directory: workingDirectory,
      env: {},
    },
  });
  if (isDev) console.debug("[tauri] executeCommand result:", result);
  return result;
}

export interface EphemeralCommandResult {
  exit_code: number;
  stdout: string;
  stderr: string;
}

export async function executeEphemeralCommand(
  commandLine: string,
  workingDirectory: string = ""
): Promise<EphemeralCommandResult> {
  if (isDev) console.debug("[tauri] executeEphemeralCommand:", { commandLine, workingDirectory });
  const result = await invoke<EphemeralCommandResult>("execute_ephemeral_command", {
    spec: {
      type: "shell",
      command_line: commandLine,
      working_directory: workingDirectory,
      env: {},
    },
  });
  if (isDev) console.debug("[tauri] executeEphemeralCommand result:", { exit_code: result.exit_code, stdoutLen: result.stdout.length, stderrLen: result.stderr.length });
  return result;
}

export async function killCommand(commandId: string): Promise<boolean> {
  if (isDev) console.debug("[tauri] killCommand:", commandId);
  return invoke<boolean>("kill_command", { commandId });
}

export async function getCommand(commandId: string): Promise<CommandInfo> {
  return invoke<CommandInfo>("get_command", { commandId });
}

export async function listCommands(
  statusFilter?: string,
  limit?: number,
  offset?: number
): Promise<CommandInfo[]> {
  if (isDev) console.debug("[tauri] listCommands:", { statusFilter, limit, offset });
  const result = await invoke<CommandInfo[]>("list_commands", {
    statusFilter,
    limit,
    offset,
  });
  if (isDev) console.debug("[tauri] listCommands:", result.length, "commands");
  return result;
}

export async function getCommandOutput(
  commandId: string
): Promise<{ stream: string; data: string; sequence: number }[]> {
  return invoke("get_command_output", { commandId });
}

export async function daemonStatus(): Promise<{
  version: string;
  uptime_seconds: number;
  running_commands: number;
}> {
  if (isDev) console.debug("[tauri] daemonStatus");
  const result = await invoke<{ version: string; uptime_seconds: number; running_commands: number }>("daemon_status");
  if (isDev) console.debug("[tauri] daemonStatus:", result);
  return result;
}

export function onCommandEvent(
  callback: (event: CommandEvent) => void
): Promise<UnlistenFn> {
  return listen<CommandEvent>("command-event", (event) => {
    if (isDev) console.debug("[tauri] command-event:", event.payload.type, event.payload.command_id);
    callback(event.payload);
  });
}
