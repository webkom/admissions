import {
  BarChart3,
  CalendarCheck,
  CalendarRange,
  LayoutPanelTop,
  Sparkles,
} from "lucide-react";

import type { TabType, WorkflowStepDefinition } from "./types";

interface WorkflowStepParams {
  isAdmin: boolean;
  activeSection: TabType;
  hasConfiguredAvailabilityWindows: boolean;
  hasDistributedPlan: boolean;
  hasSavedConfig: boolean;
  hasScheduleDraft: boolean;
  myAvailabilitySaved: boolean;
  availabilityParticipantCount: number;
  submittedAvailabilityCount: number;
}

export const buildWorkflowSteps = ({
  isAdmin,
  activeSection,
  hasConfiguredAvailabilityWindows,
  hasDistributedPlan,
  hasSavedConfig,
  hasScheduleDraft,
  myAvailabilitySaved,
  availabilityParticipantCount,
  submittedAvailabilityCount,
}: WorkflowStepParams): WorkflowStepDefinition[] => {
  if (!isAdmin) {
    return [
      {
        key: "my-availability",
        title: "Tilgjengelighet",
        description: hasConfiguredAvailabilityWindows
          ? "Marker når du kan intervjue."
          : "Vent til opptaksansvarlig åpner intervjutider.",
        icon: CalendarRange,
        status: hasConfiguredAvailabilityWindows
          ? myAvailabilitySaved
            ? "Ferdig"
            : "Pågår…"
          : "Ikke åpnet",
        tone: hasConfiguredAvailabilityWindows
          ? myAvailabilitySaved
            ? "success"
            : "active"
          : "locked",
        locked: !hasConfiguredAvailabilityWindows,
      },
      {
        key: "plan",
        title: "Intervjuplan",
        description: "Se dine intervjuer når planen er klar.",
        icon: CalendarCheck,
        status: hasDistributedPlan ? "Klar" : "Låst",
        tone: hasDistributedPlan ? "success" : "locked",
        locked: !hasDistributedPlan,
      },
    ];
  }

  return [
    {
      key: "config",
      title: "Rammer",
      description: "Velg periode, lengde og åpne tidsluker.",
      icon: LayoutPanelTop,
      status: hasSavedConfig ? "Ferdig" : "Pågår…",
      tone: hasSavedConfig ? "success" : "active",
    },
    {
      key: "my-availability",
      title: "Tilgjengelighet",
      description: "La komiteen registrere tider og habilitet.",
      icon: CalendarRange,
      status:
        availabilityParticipantCount > 0
          ? `${submittedAvailabilityCount}/${availabilityParticipantCount}`
          : myAvailabilitySaved
            ? "Ferdig"
            : "Pågår…",
      tone:
        availabilityParticipantCount > 0 &&
        submittedAvailabilityCount >= availabilityParticipantCount
          ? "success"
          : activeSection === "my-availability"
            ? "active"
            : "muted",
    },
    {
      key: "heatmap",
      title: "Fordeling",
      description: "Sjekk dekning før planen genereres.",
      icon: BarChart3,
      status: hasScheduleDraft
        ? "Ferdig"
        : submittedAvailabilityCount > 0
          ? "Klar"
          : "Venter",
      tone: hasScheduleDraft
        ? "success"
        : activeSection === "heatmap"
          ? "active"
          : "muted",
    },
    {
      key: "solver",
      title: "Intervjuforslag",
      description: "Generer og se over forslaget.",
      icon: Sparkles,
      status: !hasSavedConfig ? "Låst" : hasScheduleDraft ? "Utkast" : "Klar",
      tone: !hasSavedConfig
        ? "locked"
        : hasScheduleDraft
          ? "success"
          : activeSection === "solver"
            ? "active"
            : "muted",
      locked: !hasSavedConfig,
    },
    {
      key: "plan",
      title: "Intervjuplan",
      description: "Publiser, eksporter og følg opp.",
      icon: CalendarCheck,
      status: hasDistributedPlan
        ? "Publisert"
        : hasScheduleDraft
          ? "Klar"
          : "Låst",
      tone: hasDistributedPlan
        ? "success"
        : hasScheduleDraft || activeSection === "plan"
          ? "active"
          : "locked",
      locked: !hasScheduleDraft,
    },
  ];
};
