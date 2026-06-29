import type React from "react";

// Minimal typing for Vite's injected env (the project does not reference
// vite/client). Shapes match vite/client so a future reference merges cleanly.
declare global {
  interface ImportMetaEnv {
    readonly MODE: string;
    readonly DEV: boolean;
    readonly PROD: boolean;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

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
  tone: "success" | "active" | "muted" | "locked";
  locked?: boolean;
}
