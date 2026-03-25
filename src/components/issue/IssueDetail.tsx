import { useIssueStore } from "@/issueStore";

export function IssueDetail() {
  const output = useIssueStore((s) => s.output);
  const error = useIssueStore((s) => s.error);
  const isLoading = useIssueStore((s) => s.isLoading);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Loading issue...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 p-4">
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
          <pre className="font-mono text-sm text-destructive whitespace-pre-wrap">{error}</pre>
        </div>
      </div>
    );
  }

  if (output) {
    return (
      <div className="flex-1 p-4 min-h-0 overflow-auto">
        <pre className="font-mono text-sm whitespace-pre-wrap">{output}</pre>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-muted-foreground">Enter an issue ID to view details</p>
    </div>
  );
}
