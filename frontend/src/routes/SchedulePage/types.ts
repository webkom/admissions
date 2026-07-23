import type React from "react";

export type TabType =
  | "my-availability"
  | "heatmap"
  | "config"
  | "solver"
  | "plan";

export interface WorkflowStepDefinition {
  key: TabType;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  status: string;
  tone: "success" | "warning" | "muted" | "locked";
  complete?: boolean;
  locked?: boolean;
}

export interface ConflictReviewSummary {
  resolved: boolean;
  candidateCount: number;
  requiredReviewerCount: number;
  completeReviewerCount: number;
  incompleteReviewerCount: number;
  remainingPairCount: number;
  isComplete: boolean;
}

export type WorkflowPhase =
  | "setup"
  | "draft"
  | "awaiting-conflict-checks"
  | "ready-to-publish"
  | "published";

export type CandidateReviewState = "unreviewed" | "no-conflict" | "conflict";

export interface PublicationReadiness {
  draftSaved: boolean;
  candidateScopeResolved: boolean;
  scheduledCandidateCount: number;
  candidateCount: number;
  allCandidatesScheduled: boolean;
  reviewResolved: boolean;
  requiredReviewerCount: number;
  completeReviewerCount: number;
  incompleteReviewerCount: number;
  missingReviewerNames: string[];
  proposalConflictCount: number;
  ready: boolean;
}
