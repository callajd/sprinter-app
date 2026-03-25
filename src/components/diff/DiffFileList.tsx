import { useMemo, useCallback } from "react";
import {
  UncontrolledTreeEnvironment,
  Tree,
  StaticTreeDataProvider,
  type TreeItem,
  type TreeItemIndex,
} from "react-complex-tree";
import { useDiffStore } from "@/diffStore";
import { getFileContent, inferLanguage, type DiffFile } from "@/lib/git";
import { cn } from "@/lib/utils";

const isDev = import.meta.env.DEV;

interface FileNodeData {
  name: string;
  fullPath: string;
  status?: DiffFile["status"];
  isDir: boolean;
}

const STATUS_COLORS: Record<DiffFile["status"], string> = {
  A: "text-emerald-500",
  M: "text-amber-500",
  D: "text-red-500",
  R: "text-blue-500",
  C: "text-purple-500",
  T: "text-gray-500",
  U: "text-orange-500",
};

const STATUS_LABELS: Record<DiffFile["status"], string> = {
  A: "A",
  M: "M",
  D: "D",
  R: "R",
  C: "C",
  T: "T",
  U: "U",
};

function buildTreeItems(
  files: DiffFile[]
): Record<TreeItemIndex, TreeItem<FileNodeData>> {
  const items: Record<TreeItemIndex, TreeItem<FileNodeData>> = {
    root: {
      index: "root",
      children: [],
      isFolder: true,
      data: { name: "root", fullPath: "", isDir: true },
    },
  };

  // Track which directories we've created
  const dirs = new Set<string>();

  for (const file of files) {
    const parts = file.path.split("/");

    // Ensure all parent directories exist
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join("/");
      if (!dirs.has(dirPath)) {
        dirs.add(dirPath);
        items[dirPath] = {
          index: dirPath,
          children: [],
          isFolder: true,
          data: { name: parts[i], fullPath: dirPath, isDir: true },
        };
      }
    }

    // Add file node
    items[file.path] = {
      index: file.path,
      isFolder: false,
      data: {
        name: parts[parts.length - 1],
        fullPath: file.path,
        status: file.status,
        isDir: false,
      },
    };
  }

  // Wire up parent-child relationships
  for (const file of files) {
    const parts = file.path.split("/");

    // Connect directories
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join("/");
      const parentPath = i === 0 ? "root" : parts.slice(0, i).join("/");
      const parent = items[parentPath];
      if (parent.children && !parent.children.includes(dirPath)) {
        parent.children.push(dirPath);
      }
    }

    // Connect file to its parent
    const parentPath =
      parts.length > 1 ? parts.slice(0, -1).join("/") : "root";
    const parent = items[parentPath];
    if (parent.children && !parent.children.includes(file.path)) {
      parent.children.push(file.path);
    }
  }

  return items;
}

export function DiffFileList() {
  const files = useDiffStore((s) => s.files);
  const selectedFile = useDiffStore((s) => s.selectedFile);
  const sourceBranch = useDiffStore((s) => s.sourceBranch);
  const targetBranch = useDiffStore((s) => s.targetBranch);
  const repoPath = useDiffStore((s) => s.repoPath);

  const treeItems = useMemo(() => buildTreeItems(files), [files]);

  const dataProvider = useMemo(
    () => new StaticTreeDataProvider(treeItems),
    [treeItems]
  );

  // All directories start expanded
  const expandedItems = useMemo(
    () =>
      Object.values(treeItems)
        .filter((item) => item.isFolder)
        .map((item) => item.index),
    [treeItems]
  );

  const handlePrimaryAction = useCallback(
    async (item: TreeItem<FileNodeData>) => {
      if (item.data.isDir) return;

      const filePath = item.data.fullPath;
      const store = useDiffStore.getState();
      const file = store.files.find((f) => f.path === filePath);
      if (!file) return;

      if (isDev) console.debug("[diff] selecting file:", filePath, "status:", file.status);

      store.selectFile(filePath);
      store.setIsLoadingContent(true);
      store.setError(null);

      try {
        const sourcePath = file.oldPath ?? file.path;
        if (isDev) console.debug("[diff] fetching content:", { source: `${sourceBranch.trim()}:${sourcePath}`, target: `${targetBranch.trim()}:${file.path}` });

        const [original, modified] = await Promise.all([
          getFileContent(repoPath.trim(), sourceBranch.trim(), sourcePath),
          getFileContent(repoPath.trim(), targetBranch.trim(), file.path),
        ]);
        const language = inferLanguage(file.path);

        if (isDev) console.debug("[diff] loaded content:", { language, originalLen: original.length, modifiedLen: modified.length });

        store.setFileContents(original, modified, language);
      } catch (err) {
        if (isDev) console.error("[diff] failed to load file content:", err);
        store.setError(
          err instanceof Error ? err.message : "Failed to load file"
        );
      } finally {
        store.setIsLoadingContent(false);
      }
    },
    [repoPath, sourceBranch, targetBranch]
  );

  if (files.length === 0) {
    return null;
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 py-1.5 border-b border-border">
        <p className="text-xs text-muted-foreground">
          {files.length} file{files.length !== 1 ? "s" : ""} changed
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-auto text-xs">
        <UncontrolledTreeEnvironment
          dataProvider={dataProvider}
          getItemTitle={(item) => item.data.name}
          viewState={{
            "diff-tree": {
              expandedItems,
              selectedItems: selectedFile ? [selectedFile] : [],
            },
          }}
          onPrimaryAction={handlePrimaryAction}
          canDragAndDrop={false}
          canDropOnFolder={false}
          canReorderItems={false}
          canRename={false}
          canSearch={false}
          renderItemArrow={({ item, context }) => {
            if (!item.isFolder) {
              return <span className="inline-block w-4" />;
            }
            return (
              <span
                {...context.arrowProps}
                className="inline-flex items-center justify-center w-4 text-muted-foreground"
              >
                <svg
                  className={cn(
                    "size-3 transition-transform",
                    context.isExpanded && "rotate-90"
                  )}
                  viewBox="0 0 16 16"
                  fill="currentColor"
                >
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </span>
            );
          }}
          renderItem={({ item, depth, children, title, arrow, context }) => {
            const isSelected = selectedFile === item.data.fullPath;
            return (
              <li
                {...context.itemContainerWithChildrenProps}
                className="list-none"
              >
                <div
                  {...context.interactiveElementProps}
                  className={cn(
                    "flex items-center h-6 px-1 cursor-pointer hover:bg-accent",
                    isSelected && "bg-accent",
                    context.isFocused && "outline-none ring-1 ring-ring"
                  )}
                  style={{ paddingLeft: depth * 12 + 4 }}
                >
                  {arrow}
                  {item.data.isDir ? (
                    <span className="text-muted-foreground mr-1">
                      <svg className="size-3.5" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5a.25.25 0 01-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75z" />
                      </svg>
                    </span>
                  ) : null}
                  <span className="truncate flex-1 font-mono">{title}</span>
                  {item.data.status && (
                    <span
                      className={cn(
                        "ml-auto pl-2 font-mono font-semibold shrink-0",
                        STATUS_COLORS[item.data.status]
                      )}
                    >
                      {STATUS_LABELS[item.data.status]}
                    </span>
                  )}
                </div>
                {children}
              </li>
            );
          }}
          renderItemsContainer={({ children, containerProps }) => (
            <ul {...containerProps} className="list-none p-0 m-0">
              {children}
            </ul>
          )}
          renderTreeContainer={({ children, containerProps }) => (
            <div {...containerProps} className="py-1">
              {children}
            </div>
          )}
        >
          <Tree treeId="diff-tree" rootItem="root" treeLabel="Changed files" />
        </UncontrolledTreeEnvironment>
      </div>
    </div>
  );
}
