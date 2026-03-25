import { create } from "zustand";
import type { CommandInfo, CommandStatus, OutputLine } from "@/types";

interface OutputBuffer {
  lines: OutputLine[];
  version: number;
}

type ActiveView = "commands" | "diff" | "issue";

interface AppState {
  commands: Map<string, CommandInfo>;
  outputBuffers: Map<string, OutputBuffer>;
  selectedCommandId: string | null;
  activeView: ActiveView;

  // Actions
  setCommands: (commands: CommandInfo[]) => void;
  upsertCommand: (command: CommandInfo) => void;
  updateCommandStatus: (
    commandId: string,
    status: CommandStatus,
    exitCode?: number | null,
    completedAt?: string | null
  ) => void;
  appendOutput: (commandId: string, lines: OutputLine[]) => void;
  selectCommand: (id: string | null) => void;
  initOutputBuffer: (commandId: string) => void;
  setActiveView: (view: ActiveView) => void;
}

export const useAppStore = create<AppState>((set) => ({
  commands: new Map(),
  outputBuffers: new Map(),
  selectedCommandId: null,
  activeView: "commands",

  setCommands: (commands) =>
    set(() => {
      const map = new Map<string, CommandInfo>();
      for (const cmd of commands) {
        map.set(cmd.id, cmd);
      }
      return { commands: map };
    }),

  upsertCommand: (command) =>
    set((state) => {
      const commands = new Map(state.commands);
      commands.set(command.id, command);
      return { commands };
    }),

  updateCommandStatus: (commandId, status, exitCode, completedAt) =>
    set((state) => {
      const existing = state.commands.get(commandId);
      if (!existing) return state;
      const commands = new Map(state.commands);
      commands.set(commandId, {
        ...existing,
        status,
        exit_code: exitCode ?? existing.exit_code,
        completed_at: completedAt ?? existing.completed_at,
      });
      return { commands };
    }),

  appendOutput: (commandId, newLines) =>
    set((state) => {
      const buffers = new Map(state.outputBuffers);
      const existing = buffers.get(commandId) || { lines: [], version: 0 };
      const lines = [...existing.lines, ...newLines];
      buffers.set(commandId, { lines, version: existing.version + 1 });
      return { outputBuffers: buffers };
    }),

  selectCommand: (id) => set({ selectedCommandId: id }),
  setActiveView: (activeView) => set({ activeView }),

  initOutputBuffer: (commandId) =>
    set((state) => {
      if (state.outputBuffers.has(commandId)) return state;
      const buffers = new Map(state.outputBuffers);
      buffers.set(commandId, { lines: [], version: 0 });
      return { outputBuffers: buffers };
    }),
}));
