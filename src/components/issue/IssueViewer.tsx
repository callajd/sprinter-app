import { IssueInput } from "@/components/issue/IssueInput";
import { IssueList } from "@/components/issue/IssueList";
import { IssueDetail } from "@/components/issue/IssueDetail";

export function IssueViewer() {
  return (
    <>
      <div className="w-80 border-r border-border flex flex-col min-h-0">
        <IssueInput />
        <IssueList />
      </div>
      <div className="flex-1 flex flex-col min-h-0">
        <IssueDetail />
      </div>
    </>
  );
}
