import type React from "react";

export type TabType =
  | "heatmap"
  | "config"
  | "solver"
  | "my-availability"
  | "plan";

export interface WorkflowStepDefinition {
  key: TabType;
  /**
   * Sections this step covers in the page body. Defaults to [key]. A step
   * that spans several sections (the merged Plan step covers the draft
   * workspace and the published plan) is active while any of them is.
   */
  keys?: TabType[];
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
  draftPersistenceReady: boolean;
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
