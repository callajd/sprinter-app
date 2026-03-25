import { useEffect, useState } from "react";
import { executeEphemeralCommand, getCwd } from "@/lib/tauri";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  User,
  Bot,
  Wrench,
  FileText,
  Terminal,
  Search,
  FolderSearch,
  PenLine,
  FilePlus,
  Cpu,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

const SESSION_PATH =
  "~/.claude/projects/-Users-jefferycallahan-code-actuate-sprinters-sprinter-app/0729f003-4c79-4116-9aa2-af495aaf8ad8.jsonl";

// --- Types ---

interface TranscriptEntry {
  uuid: string;
  type: string;
  subtype?: string;
  timestamp: string;
  isMeta?: boolean;
  message?: {
    role: string;
    content: string | ContentBlock[];
  };
  data?: Record<string, unknown>;
  content?: string;
}

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  id?: string;
  tool_use_id?: string;
  content?: string | ContentSubBlock[];
  thinking?: string;
}

interface ContentSubBlock {
  type: string;
  text?: string;
}

// --- Helpers ---

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

const TOOL_ICONS: Record<string, typeof Wrench> = {
  Read: FileText,
  Write: FilePlus,
  Edit: PenLine,
  Bash: Terminal,
  Grep: Search,
  Glob: FolderSearch,
  Agent: Cpu,
};

function ToolIcon({ name }: { name: string }) {
  const Icon = TOOL_ICONS[name] ?? Wrench;
  return <Icon className="size-3.5" />;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

// --- Renderers ---

function UserMessage({ entry }: { entry: TranscriptEntry }) {
  const content = entry.message?.content;
  if (!content) return null;

  // Plain text user message
  if (typeof content === "string") {
    // Skip meta/system messages
    if (entry.isMeta) return null;
    if (content.startsWith("<local-command-caveat>")) return null;
    if (content.startsWith("<command-name>")) {
      const match = content.match(/<command-name>(.+?)<\/command-name>/);
      return (
        <div className="flex gap-3 items-start">
          <div className="size-6 rounded-full bg-blue-500/15 flex items-center justify-center shrink-0 mt-0.5">
            <User className="size-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium">User</span>
              <span className="text-[10px] text-muted-foreground">{formatTime(entry.timestamp)}</span>
            </div>
            <Badge variant="secondary" className="font-mono text-xs">{match?.[1] ?? "command"}</Badge>
          </div>
        </div>
      );
    }
    return (
      <div className="flex gap-3 items-start">
        <div className="size-6 rounded-full bg-blue-500/15 flex items-center justify-center shrink-0 mt-0.5">
          <User className="size-3.5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium">User</span>
            <span className="text-[10px] text-muted-foreground">{formatTime(entry.timestamp)}</span>
          </div>
          <div className="text-sm whitespace-pre-wrap">{content}</div>
        </div>
      </div>
    );
  }

  // Array content — tool_results
  const toolResults = content.filter((b) => b.type === "tool_result");
  const textBlocks = content.filter((b) => b.type === "text" && b.text);

  if (toolResults.length === 0 && textBlocks.length === 0) return null;

  return (
    <>
      {textBlocks.map((block, i) => (
        <div key={`${entry.uuid}-text-${i}`} className="flex gap-3 items-start">
          <div className="size-6 rounded-full bg-blue-500/15 flex items-center justify-center shrink-0 mt-0.5">
            <User className="size-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium">User</span>
              <span className="text-[10px] text-muted-foreground">{formatTime(entry.timestamp)}</span>
            </div>
            <div className="text-sm whitespace-pre-wrap">{block.text}</div>
          </div>
        </div>
      ))}
      {toolResults.map((block, i) => (
        <ToolResultBlock key={`${entry.uuid}-tr-${i}`} block={block} timestamp={entry.timestamp} />
      ))}
    </>
  );
}

function ToolResultBlock({ block, timestamp }: { block: ContentBlock; timestamp: string }) {
  const [expanded, setExpanded] = useState(false);

  let text = "";
  if (typeof block.content === "string") {
    text = block.content;
  } else if (Array.isArray(block.content)) {
    text = block.content
      .filter((c): c is ContentSubBlock => c.type === "text" && !!c.text)
      .map((c) => c.text!)
      .join("\n");
  }

  if (!text) return null;

  return (
    <div className="flex gap-3 items-start ml-9">
      <div className="flex-1 min-w-0">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground cursor-pointer mb-1"
        >
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          Tool result
          <span className="ml-1">{formatTime(timestamp)}</span>
        </button>
        {expanded && (
          <pre className="text-xs font-mono bg-muted/40 rounded-md p-3 border border-border/50 overflow-auto max-h-60 whitespace-pre-wrap">
            {truncate(text, 5000)}
          </pre>
        )}
      </div>
    </div>
  );
}

function AssistantMessage({ entry }: { entry: TranscriptEntry }) {
  const content = entry.message?.content;
  if (!content || typeof content === "string") return null;

  const blocks = content as ContentBlock[];
  const textBlocks = blocks.filter((b) => b.type === "text" && b.text);
  const toolUseBlocks = blocks.filter((b) => b.type === "tool_use");
  const thinkingBlocks = blocks.filter((b) => b.type === "thinking" && b.thinking);

  if (textBlocks.length === 0 && toolUseBlocks.length === 0 && thinkingBlocks.length === 0) return null;

  return (
    <>
      {thinkingBlocks.map((block, i) => (
        <ThinkingBlock key={`${entry.uuid}-think-${i}`} block={block} timestamp={entry.timestamp} />
      ))}
      {textBlocks.map((block, i) => (
        <div key={`${entry.uuid}-text-${i}`} className="flex gap-3 items-start">
          <div className="size-6 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0 mt-0.5">
            <Bot className="size-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium">Assistant</span>
              <span className="text-[10px] text-muted-foreground">{formatTime(entry.timestamp)}</span>
            </div>
            <div className="text-sm whitespace-pre-wrap">{block.text}</div>
          </div>
        </div>
      ))}
      {toolUseBlocks.map((block, i) => (
        <ToolUseBlock key={`${entry.uuid}-tool-${i}`} block={block} timestamp={entry.timestamp} />
      ))}
    </>
  );
}

function ThinkingBlock({ block, timestamp }: { block: ContentBlock; timestamp: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex gap-3 items-start">
      <div className="size-6 rounded-full bg-purple-500/15 flex items-center justify-center shrink-0 mt-0.5">
        <Cpu className="size-3.5 text-purple-600 dark:text-purple-400" />
      </div>
      <div className="flex-1 min-w-0">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          Thinking
          <span className="text-[10px] ml-1">{formatTime(timestamp)}</span>
        </button>
        {expanded && (
          <pre className="mt-1 text-xs font-mono bg-purple-500/5 rounded-md p-3 border border-purple-500/10 overflow-auto max-h-60 whitespace-pre-wrap text-muted-foreground">
            {truncate(block.thinking ?? "", 5000)}
          </pre>
        )}
      </div>
    </div>
  );
}

function ToolUseBlock({ block, timestamp }: { block: ContentBlock; timestamp: string }) {
  const [expanded, setExpanded] = useState(false);
  const name = block.name ?? "Unknown";
  const input = block.input ?? {};

  // Show a summary of the tool input
  let summary = "";
  if (name === "Read" || name === "Write") {
    summary = String(input.file_path ?? "").split("/").pop() ?? "";
  } else if (name === "Edit") {
    summary = String(input.file_path ?? "").split("/").pop() ?? "";
  } else if (name === "Bash") {
    summary = truncate(String(input.command ?? ""), 60);
  } else if (name === "Grep") {
    summary = truncate(String(input.pattern ?? ""), 40);
  } else if (name === "Glob") {
    summary = truncate(String(input.pattern ?? ""), 40);
  } else if (name === "Agent") {
    summary = truncate(String(input.description ?? ""), 60);
  }

  return (
    <div className="flex gap-3 items-start ml-9">
      <div className="flex-1 min-w-0">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs hover:text-foreground cursor-pointer"
        >
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          <ToolIcon name={name} />
          <Badge variant="secondary" className="font-mono text-[10px] h-4 px-1">{name}</Badge>
          {summary && <span className="text-muted-foreground font-mono text-[11px] truncate max-w-80">{summary}</span>}
          <span className="text-[10px] text-muted-foreground ml-1">{formatTime(timestamp)}</span>
        </button>
        {expanded && (
          <pre className="mt-1 text-xs font-mono bg-muted/40 rounded-md p-3 border border-border/50 overflow-auto max-h-60 whitespace-pre-wrap">
            {JSON.stringify(input, null, 2).slice(0, 3000)}
          </pre>
        )}
      </div>
    </div>
  );
}

function ProgressEntry({ entry }: { entry: TranscriptEntry }) {
  const data = entry.data as Record<string, unknown> | undefined;
  if (!data) return null;
  const hookName = String(data.hookName ?? data.type ?? "progress");

  return (
    <div className="flex items-center gap-2 py-1 ml-9">
      <Badge variant="outline" className="font-mono text-[10px] h-4 px-1 text-muted-foreground">{hookName}</Badge>
      <span className="text-[10px] text-muted-foreground">{formatTime(entry.timestamp)}</span>
    </div>
  );
}

// --- Main ---

export function TranscriptTab() {
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const cwd = await getCwd();
        const result = await executeEphemeralCommand(`cat ${SESSION_PATH}`, cwd);
        if (result.exit_code !== 0) {
          setError(result.stderr || "Failed to read session file");
          return;
        }

        const parsed: TranscriptEntry[] = [];
        for (const line of result.stdout.split("\n")) {
          if (!line.trim()) continue;
          try {
            parsed.push(JSON.parse(line));
          } catch {
            // skip malformed lines
          }
        }

        // Sort by timestamp ascending (oldest first)
        parsed.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        setEntries(parsed);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load transcript");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading transcript...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
          <pre className="font-mono text-sm text-destructive whitespace-pre-wrap">{error}</pre>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="space-y-4">
        {entries.map((entry) => {
          if (entry.type === "user" && entry.message) {
            return <UserMessage key={entry.uuid} entry={entry} />;
          }
          if (entry.type === "assistant" && entry.message) {
            return <AssistantMessage key={entry.uuid} entry={entry} />;
          }
          if (entry.type === "progress") {
            return <ProgressEntry key={entry.uuid} entry={entry} />;
          }
          // Skip file-history-snapshot, system, last-prompt
          return null;
        })}
      </div>
    </ScrollArea>
  );
}
