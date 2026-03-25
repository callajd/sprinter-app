export type CommandStatus = "pending" | "running" | "completed" | "failed" | "killed";

export interface CommandInfo {
  id: string;
  command_line: string;
  working_directory: string;
  status: CommandStatus;
  exit_code: number | null;
  pid: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface OutputLine {
  text: string;
  stream: "stdout" | "stderr";
}

export type CommandEvent =
  | {
      type: "started";
      command_id: string;
      pid: number;
      started_at: string;
    }
  | {
      type: "output";
      command_id: string;
      stream: string;
      data: string;
      sequence: number;
    }
  | {
      type: "completed";
      command_id: string;
      exit_code: number;
      completed_at: string;
    }
  | {
      type: "failed";
      command_id: string;
      error: string;
      failed_at: string;
    };
