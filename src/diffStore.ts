import { create } from "zustand";
import type { DiffFile } from "@/lib/git";

interface DiffState {
  repoPath: string;
  sourceBranch: string;
  targetBranch: string;

  files: DiffFile[];
  selectedFile: string | null;
  originalContent: string;
  modifiedContent: string;
  language: string;

  isLoadingFiles: boolean;
  isLoadingContent: boolean;
  error: string | null;
  inlineMode: boolean;

  setRepoPath: (path: string) => void;
  setSourceBranch: (branch: string) => void;
  setTargetBranch: (branch: string) => void;
  setFiles: (files: DiffFile[]) => void;
  selectFile: (path: string | null) => void;
  setFileContents: (original: string, modified: string, language: string) => void;
  setIsLoadingFiles: (loading: boolean) => void;
  setIsLoadingContent: (loading: boolean) => void;
  setError: (error: string | null) => void;
  toggleInlineMode: () => void;
}

export const useDiffStore = create<DiffState>((set) => ({
  repoPath: "",
  sourceBranch: "",
  targetBranch: "",

  files: [],
  selectedFile: null,
  originalContent: "",
  modifiedContent: "",
  language: "plaintext",

  isLoadingFiles: false,
  isLoadingContent: false,
  error: null,
  inlineMode: false,

  setRepoPath: (repoPath) => set({ repoPath }),
  setSourceBranch: (sourceBranch) => set({ sourceBranch }),
  setTargetBranch: (targetBranch) => set({ targetBranch }),
  setFiles: (files) => set({ files, selectedFile: null, error: null }),
  selectFile: (selectedFile) => set({ selectedFile }),
  setFileContents: (originalContent, modifiedContent, language) =>
    set({ originalContent, modifiedContent, language }),
  setIsLoadingFiles: (isLoadingFiles) => set({ isLoadingFiles }),
  setIsLoadingContent: (isLoadingContent) => set({ isLoadingContent }),
  setError: (error) => set({ error }),
  toggleInlineMode: () => set((s) => ({ inlineMode: !s.inlineMode })),
}));
