import React from "react";
import styled from "styled-components";

import ConfirmModal from "src/components/ConfirmModal";
import { StyledButton } from "src/components/LinkButton";

import type {
  AdmissionFormStatus,
  AdmissionReviewItem,
} from "../useAdmissionEditor";
import {
  Section,
  SectionDescription,
  SectionHeader,
  SectionNumber,
  SectionTitle,
} from "./AdmissionSectionStyles";

interface AdmissionReviewSectionsProps {
  isNew: boolean;
  reviewItems: AdmissionReviewItem[];
  isSaving: boolean;
  isDeleting: boolean;
  hasUnsavedChanges: boolean;
  saveStatus?: AdmissionFormStatus;
  deleteStatus?: AdmissionFormStatus;
  canDelete: boolean;
  onDelete: () => void;
}

const AdmissionReviewSections = ({
  isNew,
  reviewItems,
  isSaving,
  isDeleting,
  hasUnsavedChanges,
  saveStatus,
  deleteStatus,
  canDelete,
  onDelete,
}: AdmissionReviewSectionsProps) => (
  <>
    <Section aria-labelledby="review-admission-title">
      <SectionHeader>
        <SectionNumber aria-hidden="true">5</SectionNumber>
        <div>
          <SectionTitle id="review-admission-title">
            Kontroller og lagre
          </SectionTitle>
          <SectionDescription>
            Kontroller navn, datoer og tilgang før du lagrer.
          </SectionDescription>
        </div>
      </SectionHeader>

      <ReviewList>
        {reviewItems.map(({ label, value }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </ReviewList>

      {saveStatus && <StatusMessage status={saveStatus} />}

      <ActionRow>
        <StyledButton type="submit" disabled={isSaving || isDeleting} success>
          {isSaving ? "Lagrer…" : isNew ? "Opprett opptak" : "Lagre endringer"}
        </StyledButton>
        {hasUnsavedChanges && (
          <UnsavedStatus role="status">Ulagrede endringer</UnsavedStatus>
        )}
      </ActionRow>
    </Section>

    {!isNew && (
      <DangerSection aria-labelledby="delete-admission-title">
        <SectionTitle id="delete-admission-title">Slett opptak</SectionTitle>
        <SectionDescription>
          Opptaket kan bare slettes etter at det har stengt. Søknader og
          intervjudata slettes permanent.
        </SectionDescription>
        <ConfirmModal
          title="Slett opptak"
          trigger={({ onClick }) => (
            <StyledButton
              type="button"
              disabled={isDeleting || !canDelete}
              onClick={onClick}
              danger
            >
              {isDeleting ? "Sletter…" : "Slett opptak"}
            </StyledButton>
          )}
          message="Er du sikker? Alle søknader og intervjudata for opptaket slettes permanent."
          cancelText="Avbryt"
          confirmText="Slett permanent"
          onConfirm={onDelete}
        />
        {deleteStatus && <StatusMessage status={deleteStatus} />}
      </DangerSection>
    )}
  </>
);

interface StatusMessageProps {
  status: AdmissionFormStatus;
}

const StatusMessage = ({ status }: StatusMessageProps) => (
  <Status
    $type={status.type}
    role={status.type === "error" ? "alert" : "status"}
    aria-live={status.type === "success" ? "polite" : undefined}
  >
    {status.message}
  </Status>
);

export default AdmissionReviewSections;

const ReviewList = styled.dl`
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(var(--control-min-width), 100%), 1fr)
  );
  gap: var(--spacing-xl);
  margin: 0;

  div {
    min-width: 0;
  }

  dt {
    color: var(--color-text-muted);
    font-size: var(--font-size-detail);
    font-weight: var(--font-weight-semibold);
  }

  dd {
    margin: var(--spacing-xs) 0 0;
    overflow-wrap: anywhere;
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }
`;

const Status = styled.div<{ $type: AdmissionFormStatus["type"] }>`
  margin-top: var(--spacing-xl);
  padding: var(--spacing-md) var(--spacing-lg);
  border: var(--border-width-default) solid
    ${({ $type }) =>
      $type === "success"
        ? "var(--color-success-border)"
        : "var(--color-danger-border)"};
  border-radius: var(--border-radius-md);
  background: ${({ $type }) =>
    $type === "success" ? "var(--color-success-bg)" : "var(--color-danger-bg)"};
  color: ${({ $type }) =>
    $type === "success" ? "var(--color-success)" : "var(--color-danger)"};
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
`;

const ActionRow = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-lg);
  margin-top: var(--spacing-xl);
`;

const UnsavedStatus = styled.span`
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
`;

const DangerSection = styled.section`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-md);
  padding: var(--spacing-2xl) 0;
  border-top: var(--border-width-default) solid var(--color-danger-border);
`;
