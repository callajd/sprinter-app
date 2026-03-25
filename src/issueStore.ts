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
  description?: string;
  status: string;
  priority: number;
  issue_type: string;
  assignee?: string;
  labels?: string[];
  dependency_type: string;
}

export interface BeadsIssueSummary {
  id: string;
  title: string;
  status: string;
  priority: number;
  issue_type: string;
  assignee?: string;
  created_at: string;
  updated_at: string;
}

interface IssueState {
  issueId: string;
  issue: BeadsIssue | null;
  error: string | null;
  isLoading: boolean;

  issuesList: BeadsIssueSummary[];
  isLoadingList: boolean;

  setIssueId: (id: string) => void;
  setIssue: (issue: BeadsIssue | null) => void;
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setIssuesList: (issues: BeadsIssueSummary[]) => void;
  setIsLoadingList: (loading: boolean) => void;
  reset: () => void;
}

export const useIssueStore = create<IssueState>((set) => ({
  issueId: "",
  issue: null,
  error: null,
  isLoading: false,

  issuesList: [],
  isLoadingList: false,

  setIssueId: (issueId) => set({ issueId }),
  setIssue: (issue) => set({ issue }),
  setError: (error) => set({ error }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setIssuesList: (issuesList) => set({ issuesList }),
  setIsLoadingList: (isLoadingList) => set({ isLoadingList }),
  reset: () => set({ issue: null, error: null }),
}));
