import { create } from "zustand";

interface IssueState {
  issueId: string;
  output: string | null;
  error: string | null;
  isLoading: boolean;

  setIssueId: (id: string) => void;
  setOutput: (output: string | null) => void;
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useIssueStore = create<IssueState>((set) => ({
  issueId: "",
  output: null,
  error: null,
  isLoading: false,

  setIssueId: (issueId) => set({ issueId }),
  setOutput: (output) => set({ output }),
  setError: (error) => set({ error }),
  setIsLoading: (isLoading) => set({ isLoading }),
  reset: () => set({ output: null, error: null }),
}));
