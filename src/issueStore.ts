import { create } from "zustand";

export interface BeadsIssue {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  issue_type: string;
  assignee?: string;
  owner?: string;
  created_at: string;
  created_by?: string;
  updated_at: string;
  closed_at?: string;
  close_reason?: string;
  labels?: string[];
  parent?: string;
  notes?: string;
  design?: string;
  acceptance?: string;
  dependencies?: BeadsRelatedIssue[];
  dependents?: BeadsRelatedIssue[];
}

export interface BeadsRelatedIssue {
  id: string;
  title: string;
  status: string;
  priority: number;
  issue_type: string;
  assignee?: string;
  dependency_type: string;
}

interface IssueState {
  issueId: string;
  issue: BeadsIssue | null;
  error: string | null;
  isLoading: boolean;

  setIssueId: (id: string) => void;
  setIssue: (issue: BeadsIssue | null) => void;
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useIssueStore = create<IssueState>((set) => ({
  issueId: "",
  issue: null,
  error: null,
  isLoading: false,

  setIssueId: (issueId) => set({ issueId }),
  setIssue: (issue) => set({ issue }),
  setError: (error) => set({ error }),
  setIsLoading: (isLoading) => set({ isLoading }),
  reset: () => set({ issue: null, error: null }),
}));
