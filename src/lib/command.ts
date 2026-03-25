import type { CommandInfo } from "@/types";

/** Extract just the executable name from a full command line. */
export function executableName(commandLine: string): string {
  if (!commandLine) return "...";
  const firstToken = commandLine.trim().split(/\s+/)[0];
  const parts = firstToken.split("/");
  return parts[parts.length - 1] || firstToken;
}

/** Replace the executable path with just its basename, keeping all arguments. */
export function displayCommandLine(commandLine: string): string {
  if (!commandLine) return "";
  const trimmed = commandLine.trim();
  const spaceIndex = trimmed.indexOf(" ");
  const exe = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  const args = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex);
  const basename = exe.split("/").pop() || exe;
  return basename + args;
}

/** Get the directory to display on hover — explicit working_directory, or the
 *  directory portion of an absolute executable path. */
export function commandDirectory(commandLine: string, workingDirectory: string): string {
  if (workingDirectory) return workingDirectory;
  if (!commandLine) return "";
  const exe = commandLine.trim().split(/\s+/)[0];
  const lastSlash = exe.lastIndexOf("/");
  if (lastSlash > 0) return exe.slice(0, lastSlash);
  return "";
}

/** Signal names for 128+N exit codes. */
const signalNames: Record<number, string> = {
  1: "SIGHUP",
  2: "SIGINT",
  3: "SIGQUIT",
  4: "SIGILL",
  6: "SIGABRT",
  8: "SIGFPE",
  9: "SIGKILL",
  11: "SIGSEGV",
  13: "SIGPIPE",
  14: "SIGALRM",
  15: "SIGTERM",
};

interface ExitCodeResult {
  label: string;
  colorClass: string;
}

/** Map an exit code to a human-readable label and color class. */
export function exitCodeResult(exitCode: number): ExitCodeResult {
  if (exitCode === 0) {
    return { label: "SUCCESS", colorClass: "bg-exit-success text-white" };
  }
  if (exitCode === 1) {
    return { label: "ERROR", colorClass: "bg-exit-general-error text-white" };
  }
  if (exitCode === 2) {
    return { label: "USAGE", colorClass: "bg-exit-usage-error text-white" };
  }
  if (exitCode === 126) {
    return { label: "NOT EXECUTABLE", colorClass: "bg-exit-not-executable text-white" };
  }
  if (exitCode === 127) {
    return { label: "NOT FOUND", colorClass: "bg-exit-not-found text-white" };
  }
  if (exitCode > 128 && exitCode <= 192) {
    const signal = exitCode - 128;
    const name = signalNames[signal];
    if (name) {
      // Specific signal colors
      if (signal === 2) return { label: name, colorClass: "bg-exit-sigint text-white" };
      if (signal === 15) return { label: name, colorClass: "bg-exit-sigterm text-white" };
      if (signal === 9) return { label: name, colorClass: "bg-exit-sigkill text-white" };
      return { label: name, colorClass: "bg-exit-signal text-white" };
    }
    return { label: `SIGNAL ${signal}`, colorClass: "bg-exit-signal text-white" };
  }
  return { label: `EXIT ${exitCode}`, colorClass: "bg-exit-general-error text-white" };
}

/** Get the badge label for a command, considering exit code when completed. */
export function commandBadgeLabel(command: CommandInfo): string {
  if (command.status === "running" || command.status === "pending") {
    return "RUNNING";
  }
  if (command.status === "killed") {
    return "KILLED";
  }
  if (command.exit_code != null) {
    return exitCodeResult(command.exit_code).label;
  }
  if (command.status === "failed") {
    return "FAILED";
  }
  return "COMPLETED";
}

/** Get the badge color class for a command, considering exit code when completed. */
export function commandBadgeColor(command: CommandInfo): string {
  if (command.status === "running" || command.status === "pending") {
    return "bg-status-running text-white";
  }
  if (command.status === "killed") {
    return "bg-status-killed text-white";
  }
  if (command.exit_code != null) {
    return exitCodeResult(command.exit_code).colorClass;
  }
  if (command.status === "failed") {
    return "bg-status-failed text-white";
  }
  return "bg-status-completed text-white";
}

// Keep for backward compat but prefer commandBadgeColor/commandBadgeLabel
export const statusColors: Record<string, string> = {
  running: "bg-status-running text-white",
  completed: "bg-status-completed text-white",
  failed: "bg-status-failed text-white",
  killed: "bg-status-killed text-white",
  pending: "bg-status-running text-white",
};

export const statusLabels: Record<string, string> = {
  running: "RUNNING",
  completed: "COMPLETED",
  failed: "FAILED",
  killed: "KILLED",
  pending: "RUNNING",
};
