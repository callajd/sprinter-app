import { DiffConfig } from "@/components/diff/DiffConfig";
import { DiffFileList } from "@/components/diff/DiffFileList";
import { DiffEditorPanel } from "@/components/diff/DiffEditorPanel";

export function DiffViewer() {
  return (
    <>
      <div className="w-80 border-r border-border flex flex-col min-h-0">
        <DiffConfig />
        <DiffFileList />
      </div>
      <div className="flex-1 flex flex-col min-h-0">
        <DiffEditorPanel />
      </div>
    </>
  );
}
