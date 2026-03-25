import { executeEphemeralCommand } from "@/lib/tauri";
import { homeDir } from "@tauri-apps/api/path";

const isDev = import.meta.env.DEV;

export interface DiffFile {
  path: string;
  oldPath?: string;
  status: "A" | "M" | "D" | "R" | "C" | "T" | "U";
}

let cachedHomeDir: string | null = null;

async function resolveHome(path: string): Promise<string> {
  if (!path.startsWith("~")) return path;
  if (!cachedHomeDir) {
    cachedHomeDir = await homeDir();
    // Remove trailing slash if present
    if (cachedHomeDir.endsWith("/")) {
      cachedHomeDir = cachedHomeDir.slice(0, -1);
    }
  }
  if (path === "~") return cachedHomeDir;
  if (path.startsWith("~/")) return cachedHomeDir + path.slice(1);
  return path;
}

async function runGitCommand(repoPath: string, args: string): Promise<string> {
  const resolvedPath = await resolveHome(repoPath);
  const cmd = `git ${args}`;

  if (isDev) console.debug("[git] exec:", cmd, "in:", resolvedPath);

  const result = await executeEphemeralCommand(cmd, resolvedPath);

  if (isDev) {
    console.debug("[git] finished:", { exit_code: result.exit_code });
    if (result.stdout) console.debug("[git] stdout:", result.stdout.length > 200 ? result.stdout.slice(0, 200) + "..." : result.stdout);
    if (result.stderr) console.debug("[git] stderr:", result.stderr);
  }

  if (result.exit_code !== 0) {
    throw new Error(result.stderr || `git command failed (exit code ${result.exit_code})`);
  }

  return result.stdout;
}

export async function validateRepo(repoPath: string): Promise<boolean> {
  try {
    await runGitCommand(repoPath, "rev-parse --git-dir");
    if (isDev) console.debug("[git] validateRepo: valid");
    return true;
  } catch (err) {
    if (isDev) console.warn("[git] validateRepo: invalid -", err);
    return false;
  }
}

export async function getChangedFiles(
  repoPath: string,
  source: string,
  target: string
): Promise<DiffFile[]> {
  const output = await runGitCommand(
    repoPath,
    `diff --name-status ${source}...${target}`
  );

  if (!output.trim()) return [];

  return output
    .trim()
    .split("\n")
    .map((line) => {
      const parts = line.split("\t");
      const statusCode = parts[0];

      // Renamed/Copied: R100\told-path\tnew-path
      if (statusCode.startsWith("R") || statusCode.startsWith("C")) {
        return {
          path: parts[2],
          oldPath: parts[1],
          status: statusCode[0] as DiffFile["status"],
        };
      }

      return {
        path: parts[1],
        status: statusCode[0] as DiffFile["status"],
      };
    });
}

export async function getFileContent(
  repoPath: string,
  ref: string,
  filePath: string
): Promise<string> {
  try {
    return await runGitCommand(repoPath, `show ${ref}:${filePath}`);
  } catch {
    // File doesn't exist at this ref (added or deleted)
    return "";
  }
}

const EXTENSION_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  html: "html",
  css: "css",
  scss: "scss",
  less: "less",
  md: "markdown",
  rs: "rust",
  py: "python",
  go: "go",
  java: "java",
  kt: "kotlin",
  rb: "ruby",
  php: "php",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  swift: "swift",
  sql: "sql",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  svg: "xml",
  dockerfile: "dockerfile",
  proto: "protobuf",
};

export function inferLanguage(filePath: string): string {
  const fileName = filePath.split("/").pop() ?? "";
  const lowerName = fileName.toLowerCase();

  if (lowerName === "dockerfile") return "dockerfile";
  if (lowerName === "makefile") return "makefile";

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MAP[ext] ?? "plaintext";
}
