import { executeEphemeralCommand, getCwd } from "@/lib/tauri";
import { useIssueStore, type BeadsIssue, type BeadsIssueSummary } from "@/issueStore";

export async function navigateToIssue(id: string) {
  const store = useIssueStore.getState();
  store.setIssueId(id);
  store.reset();
  store.setIsLoading(true);

  try {
    const cwd = await getCwd();
    const result = await executeEphemeralCommand("bd show --json " + id, cwd);
    if (result.exit_code === 0) {
      const parsed: BeadsIssue[] = JSON.parse(result.stdout);
      if (parsed.length > 0) {
        store.setIssue(parsed[0]);
      } else {
        store.setError("No issue found for " + id);
      }
    } else {
      store.setError(result.stderr || "Command failed with exit code " + result.exit_code);
    }
  } catch (err) {
    store.setError(err instanceof Error ? err.message : "Failed to load issue");
  } finally {
    store.setIsLoading(false);
  }
}

export async function loadIssues(showAll: boolean) {
  const store = useIssueStore.getState();
  store.setIsLoadingList(true);

  try {
    const cwd = await getCwd();
    const cmd = showAll
      ? "bd list --all --limit 0 --json"
      : "bd list --status open --limit 0 --json";
    const result = await executeEphemeralCommand(cmd, cwd);
    if (result.exit_code === 0) {
      const parsed: BeadsIssueSummary[] = JSON.parse(result.stdout);
      store.setIssuesList(parsed);
    }
  } catch {
    // Silently fail — list is supplementary
  } finally {
    store.setIsLoadingList(false);
  }
}
