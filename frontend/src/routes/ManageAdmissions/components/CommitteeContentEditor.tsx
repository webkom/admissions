import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle } from "lucide-react";
import styled from "styled-components";

import type { CommitteeContent, MutationAdmission } from "src/query/mutations";
import type { Group } from "src/types";

type ContentField = keyof CommitteeContent;
type PreviewDestination = "card" | "application";

interface CommitteeContentEditorProps {
  groups: Group[];
  value: MutationAdmission["group_content"];
  onChange: (groupId: string, content: CommitteeContent) => void;
  error?: string;
  /**
   * Whether "Bruk felles standardtekst" can be trusted here. It works by
   * clearing the field so getFieldValue falls back to group.description -
   * which is only the true shared default when `groups` came from the raw
   * Group list (the manage page's useManageGroups). On the admin page,
   * `groups` comes from the admission-scoped serializer, where `description`
   * is already resolved to any admission-specific override - so the
   * "fallback" is whatever text is already showing, and the button silently
   * does nothing. Default true so existing (manage-page) callers keep the
   * working button without every call site having to know this distinction.
   */
  canResetToDefault?: boolean;
}

const contentFields: Array<{
  field: ContentField;
  label: string;
  help: string;
  placeholder: string;
  maxLength: number;
  rows: number;
}> = [
  {
    field: "committee_info",
    label: "Kort presentasjon",
    help: "Vises på komitékortet når søkeren sammenligner komiteer.",
    placeholder: "Vår komité har ansvar for… \n\nVi er opptatt av...",
    maxLength: 600,
    rows: 4,
  },
  {
    field: "application_guidance",
    label: "Søkerinformasjon",
    help: "Hjelp søkeren å forstå hva de bør skrive om i søknaden og hva intervjuet innebærer.",
    placeholder:
      "Skriv litt om hvorfor...\n\nSkriv litt om hvordan...\n\nSkriv litt om når...",
    maxLength: 600,
    rows: 5,
  },
];

const emptyContent: CommitteeContent = {
  committee_info: null,
  application_guidance: null,
  interview_description: null,
};

const getFieldValue = (
  group: Group,
  content: CommitteeContent,
  field: ContentField,
) => {
  if (content[field] !== null) return content[field] ?? "";
  if (field === "committee_info") return group.description ?? "";
  if (field === "application_guidance") return group.response_label ?? "";
  return "";
};

const getApplicationAndInterviewValue = (
  group: Group,
  content: CommitteeContent,
) => {
  // null means "never set, inherit the committee's default text"; an empty
  // string means the admin deliberately emptied the field. Treating both as
  // "fall back to the default" made this field impossible to clear - it
  // snapped straight back to the default text, and whatever was typed next
  // landed after it. Mirrors getFieldValue's null check above.
  if (
    content.application_guidance === null &&
    content.interview_description === null
  ) {
    return group.response_label ?? "";
  }

  const applicationGuidance = content.application_guidance ?? "";
  const interviewDescription = content.interview_description ?? "";

  if (applicationGuidance === interviewDescription) {
    return applicationGuidance;
  }

  if (!applicationGuidance) return interviewDescription;
  if (!interviewDescription) return applicationGuidance;
  return `${applicationGuidance}\\n\\n${interviewDescription}`;
};

const getCompletedFieldCount = (content: CommitteeContent) =>
  contentFields.filter((field) => {
    if (field.field === "application_guidance") {
      return (
        Boolean(content.application_guidance?.trim()) ||
        Boolean(content.interview_description?.trim())
      );
    }
    return Boolean(content[field.field]?.trim());
  }).length;

const CommitteeContentEditor: React.FC<CommitteeContentEditorProps> = ({
  groups,
  value,
  onChange,
  error,
  canResetToDefault = true,
}) => {
  const [activeGroupId, setActiveGroupId] = useState(groups[0]?.pk ?? "");
  const [previewDestination, setPreviewDestination] =
    useState<PreviewDestination>("card");

  useEffect(() => {
    if (groups.some((group) => group.pk === activeGroupId)) return;
    setActiveGroupId(groups[0]?.pk ?? "");
  }, [activeGroupId, groups]);

  const activeGroup = useMemo(
    () => groups.find((group) => group.pk === activeGroupId) ?? groups[0],
    [activeGroupId, groups],
  );

  if (!activeGroup) {
    return (
      <EmptyState>
        Velg opptaksgrupper over for å legge til komitéinformasjon.
      </EmptyState>
    );
  }

  const activeContent = value[activeGroup.pk] ?? emptyContent;
  const completedGroups = groups.filter(
    (group) =>
      getCompletedFieldCount(value[group.pk] ?? emptyContent) ===
      contentFields.length,
  ).length;
  // A picker and a "3 av 5 utfylt" tally exist to help someone choose between
  // several committees. With exactly one there is nothing to choose and
  // nothing to tally - the fields below already show whether it's filled in.
  const showCommitteeNav = groups.length > 1;

  return (
    <Editor data-admission-field="group_content" aria-invalid={Boolean(error)}>
      {showCommitteeNav && (
        <EditorSummary>
          <strong>
            {completedGroups} av {groups.length} komiteer utfylt
          </strong>
        </EditorSummary>
      )}
      <EditorLayout $singleCommittee={!showCommitteeNav}>
        {showCommitteeNav && (
          <CommitteeList aria-label="Velg komité">
            <CommitteeListTitle>Komiteer</CommitteeListTitle>
            {groups.map((group) => {
              const completion = getCompletedFieldCount(
                value[group.pk] ?? emptyContent,
              );
              const isSelected = group.pk === activeGroup.pk;
              return (
                <CommitteeButton
                  key={group.pk}
                  type="button"
                  data-group-name={group.name}
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => setActiveGroupId(group.pk)}
                >
                  {group.logo ? (
                    <CommitteeLogo src={group.logo} alt="" />
                  ) : (
                    <CommitteeFallback aria-hidden="true">
                      {group.name.slice(0, 1)}
                    </CommitteeFallback>
                  )}
                  <CommitteeName>{group.name}</CommitteeName>
                  <Completion
                    aria-label={`${completion} av ${contentFields.length} felt fylt ut`}
                  >
                    {completion === contentFields.length ? (
                      <CheckCircle size={16} />
                    ) : (
                      `${completion}/${contentFields.length}`
                    )}
                  </Completion>
                </CommitteeButton>
              );
            })}
          </CommitteeList>
        )}

        <DetailPanel>
          <DetailHeading>
            {activeGroup.logo ? (
              <CommitteeLogo src={activeGroup.logo} alt="" />
            ) : (
              <CommitteeFallback aria-hidden="true">
                {activeGroup.name.slice(0, 1)}
              </CommitteeFallback>
            )}
            <div>
              <h3>{activeGroup.name}</h3>
              <p>Informasjon for dette opptaket.</p>
            </div>
          </DetailHeading>

          <FieldGroups>
            <FieldGroup>
              <StageHeading>Når søkeren velger komité</StageHeading>
              <ContentFieldEditor
                group={activeGroup}
                content={activeContent}
                field={contentFields[0]}
                error={error}
                onChange={onChange}
                onFocus={() => setPreviewDestination("card")}
                canResetToDefault={canResetToDefault}
              />
            </FieldGroup>
            <FieldGroup>
              <StageHeading>Når søkeren skriver søknaden</StageHeading>
              <ContentFieldEditor
                group={activeGroup}
                content={activeContent}
                field={contentFields[1]}
                error={error}
                onChange={onChange}
                onFocus={() => setPreviewDestination("application")}
                canResetToDefault={canResetToDefault}
              />
            </FieldGroup>
          </FieldGroups>
        </DetailPanel>

        <CommitteeContentPreview
          group={activeGroup}
          content={activeContent}
          destination={previewDestination}
          setDestination={setPreviewDestination}
        />
      </EditorLayout>
      {error && (
        <FieldError id="committee-content-error" role="alert">
          {error}
        </FieldError>
      )}
    </Editor>
  );
};

interface ContentFieldEditorProps {
  group: Group;
  content: CommitteeContent;
  field: (typeof contentFields)[number];
  error?: string;
  onChange: CommitteeContentEditorProps["onChange"];
  onFocus: () => void;
  canResetToDefault: boolean;
}

const ContentFieldEditor: React.FC<ContentFieldEditorProps> = ({
  group,
  content,
  field,
  error,
  onChange,
  onFocus,
  canResetToDefault,
}) => {
  const fieldValue =
    field.field === "application_guidance"
      ? getApplicationAndInterviewValue(group, content)
      : getFieldValue(group, content, field.field);
  const usesDefaultText = content[field.field] === null;
  const hasDefaultText =
    canResetToDefault &&
    (field.field === "committee_info"
      ? Boolean(group.description?.trim())
      : field.field === "application_guidance" &&
        Boolean(group.response_label?.trim()));
  const id = `committee-content-${group.pk}-${field.field}`;

  return (
    <FieldBlock>
      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
      <FieldHelp id={`${id}-help`}>{field.help}</FieldHelp>
      <TextArea
        id={id}
        name={`group_content.${group.pk}.${field.field}`}
        value={fieldValue}
        maxLength={field.maxLength}
        rows={field.rows}
        placeholder={field.placeholder}
        aria-describedby={`${id}-help${error ? " committee-content-error" : ""}`}
        aria-invalid={Boolean(error)}
        onFocus={onFocus}
        onChange={(event) =>
          onChange(group.pk, {
            ...content,
            ...(field.field === "application_guidance"
              ? {
                  application_guidance: event.target.value,
                  interview_description: null,
                }
              : { [field.field]: event.target.value }),
          })
        }
      />
      <FieldMeta>
        {hasDefaultText ? (
          <UseDefaultButton
            type="button"
            disabled={usesDefaultText}
            onClick={() =>
              onChange(group.pk, {
                ...content,
                ...(field.field === "application_guidance"
                  ? { application_guidance: null, interview_description: null }
                  : { [field.field]: null }),
              })
            }
          >
            Bruk felles standardtekst
          </UseDefaultButton>
        ) : (
          <span />
        )}
        <CharacterCount aria-live="polite">
          {fieldValue.length} / {field.maxLength}
        </CharacterCount>
      </FieldMeta>
    </FieldBlock>
  );
};

interface CommitteeContentPreviewProps {
  group: Group;
  content: CommitteeContent;
  destination: PreviewDestination;
  setDestination: (destination: PreviewDestination) => void;
}

const CommitteeContentPreview: React.FC<CommitteeContentPreviewProps> = ({
  group,
  content,
  destination,
  setDestination,
}) => {
  const committeeInfo = getFieldValue(group, content, "committee_info");
  const applicationAndInterview = getApplicationAndInterviewValue(
    group,
    content,
  );

  return (
    <Preview data-cy="committee-content-preview">
      <PreviewHeader>
        <PreviewTitle>Slik ser søkeren det</PreviewTitle>
        <PreviewTabs aria-label="Forhåndsvisning">
          <PreviewTab
            type="button"
            aria-pressed={destination === "card"}
            onClick={() => setDestination("card")}
          >
            Komitékort
          </PreviewTab>
          <PreviewTab
            type="button"
            aria-pressed={destination === "application"}
            onClick={() => setDestination("application")}
          >
            Søknad
          </PreviewTab>
        </PreviewTabs>
      </PreviewHeader>
      {destination === "card" ? (
        <ApplicantCard>
          <ApplicantCardHeader>
            <PreviewIdentity group={group} />
          </ApplicantCardHeader>
          <PreviewBody $isEmpty={!committeeInfo.trim()}>
            {committeeInfo || "Ingen tekst vises på kortet ennå."}
          </PreviewBody>
          <PreviewCardAction>Velg komité</PreviewCardAction>
        </ApplicantCard>
      ) : (
        <ApplicantApplication>
          <ApplicantCardHeader>
            <PreviewIdentity group={group} />
          </ApplicantCardHeader>
          <PreviewLabel>Søkerinformasjon</PreviewLabel>
          <PreviewBody $isEmpty={!applicationAndInterview.trim()}>
            {applicationAndInterview ||
              "Ingen veiledning vises over søknadsteksten ennå."}
          </PreviewBody>
          <PreviewInputLabel>Søknadstekst</PreviewInputLabel>
          <PreviewInput>Skriv søknadstekst her…</PreviewInput>
        </ApplicantApplication>
      )}
    </Preview>
  );
};

const PreviewIdentity = ({ group }: { group: Group }) => (
  <>
    {group.logo ? (
      <PreviewLogo src={group.logo} alt="" />
    ) : (
      <PreviewFallback aria-hidden="true">
        {group.name.slice(0, 1)}
      </PreviewFallback>
    )}
    <ApplicantCardName>{group.name}</ApplicantCardName>
  </>
);

export default CommitteeContentEditor;

const Editor = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  min-width: 0;
`;
const EditorSummary = styled.p`
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-sm);
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  strong {
    color: var(--color-text-primary);
  }
`;
const EditorLayout = styled.div<{ $singleCommittee?: boolean }>`
  display: grid;
  grid-template-columns: ${({ $singleCommittee }) =>
    $singleCommittee
      ? "minmax(0, 1fr) minmax(17rem, 20rem)"
      : "minmax(11rem, 0.72fr) minmax(0, 2fr) minmax(15rem, 0.9fr)"};
  gap: var(--spacing-3xl);
  align-items: start;
  @media (max-width: 1050px) {
    grid-template-columns: ${({ $singleCommittee }) =>
      $singleCommittee ? "1fr" : "minmax(11rem, 0.65fr) minmax(0, 1.35fr)"};
    ${""} > section {
      grid-column: 1 / -1;
    }
  }
  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`;
const CommitteeList = styled.nav`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: var(--spacing-md);
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-subtle);
  @media (max-width: 680px) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  }
`;
const CommitteeListTitle = styled.h3`
  grid-column: 1 / -1;
  margin: 0 0 var(--spacing-xs);
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;
const CommitteeButton = styled.button`
  display: flex;
  align-items: center;
  min-width: 0;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  border: 0;
  border-radius: var(--border-radius-sm);
  background: transparent;
  color: var(--color-text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  &[aria-current="true"] {
    background: var(--color-surface-base);
    box-shadow: inset 3px 0 0 var(--color-brand);
  }
  &:hover {
    background: var(--color-surface-base);
  }
  &:focus-visible {
    outline: 2px solid var(--color-brand-ring);
    outline-offset: 2px;
  }
`;
const CommitteeLogo = styled.img`
  width: var(--avatar-size-sm);
  height: var(--avatar-size-sm);
  flex: 0 0 auto;
  border-radius: var(--border-radius-pill);
  object-fit: contain;
`;
const CommitteeFallback = styled.span`
  display: inline-flex;
  width: var(--avatar-size-sm);
  height: var(--avatar-size-sm);
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: var(--border-radius-pill);
  background: var(--color-brand-soft);
  color: var(--color-brand);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
`;
const CommitteeName = styled.span`
  overflow: hidden;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
`;
const Completion = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 1.75rem;
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
  svg {
    color: var(--color-success);
  }
`;
const DetailPanel = styled.div`
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--spacing-xl);
`;
const DetailHeading = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  h3 {
    margin: 0;
    color: var(--color-text-primary);
    font-size: var(--font-size-heading-xs);
  }
  p {
    margin: var(--spacing-xs) 0 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
  }
`;
const FieldGroups = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xl);
`;
const FieldGroup = styled.section`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  padding-top: var(--spacing-lg);
  border-top: var(--border-width-default) solid var(--color-border-soft);
`;
const StageHeading = styled.h4`
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
`;
const FieldBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  min-width: 0;
`;
const FieldLabel = styled.label`
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
`;
const FieldHelp = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-copy);
`;
const TextArea = styled.textarea`
  width: 100%;
  max-width: 100%;
  resize: vertical;
  padding: var(--spacing-md);
  border: var(--border-width-default) solid var(--color-border-muted);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-base);
  color: var(--color-text-primary);
  font: inherit;
  line-height: var(--line-height-copy);
  transition:
    border-color 120ms ease,
    box-shadow 120ms ease;
  &:hover {
    border-color: var(--color-border-strong);
  }
  &[aria-invalid="true"] {
    border-color: var(--color-danger-border);
  }
  &:focus-visible {
    outline: none;
    border-color: var(--color-brand-input);
    box-shadow: 0 0 0 3px var(--color-brand-ring-soft);
  }
`;
const FieldMeta = styled.div`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
`;
const UseDefaultButton = styled.button`
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-brand);
  font: inherit;
  font-size: var(--font-size-detail);
  font-weight: var(--font-weight-semibold);
  cursor: pointer;
  text-decoration: underline;
  &:disabled {
    color: var(--color-text-muted);
    cursor: default;
    text-decoration: none;
  }
  &:focus-visible {
    outline: 2px solid var(--color-brand-ring);
    outline-offset: 2px;
  }
`;
const CharacterCount = styled.span`
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
  text-align: right;
`;
const EmptyState = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
`;
const FieldError = styled.p`
  margin: 0;
  color: var(--color-danger);
  font-size: var(--font-size-sm);
`;
const Preview = styled.section`
  position: sticky;
  top: var(--content-sticky-offset);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  border-left: var(--border-width-emphasis) solid var(--color-brand);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-subtle);
  box-shadow: var(--shadow-panel);
  @media (max-width: 1050px) {
    position: static;
  }
`;
const PreviewHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
`;
const PreviewTitle = styled.h4`
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;
const PreviewTabs = styled.div`
  display: flex;
  gap: var(--spacing-sm);
`;
const PreviewTab = styled.button`
  padding: var(--spacing-xs) var(--spacing-sm);
  border: var(--border-width-default) solid transparent;
  border-radius: var(--border-radius-pill);
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  font-size: var(--font-size-detail);
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease,
    border-color 120ms ease;
  &:hover {
    background: var(--color-surface-base);
  }
  &[aria-pressed="true"] {
    border-color: var(--color-brand);
    background: var(--color-surface-base);
    color: var(--color-brand);
    font-weight: var(--font-weight-semibold);
  }
`;
const ApplicantCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-base);
  box-shadow: var(--shadow-panel);
`;
const ApplicantApplication = styled(ApplicantCard)`
  gap: var(--spacing-sm);
`;
const ApplicantCardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
`;
const ApplicantCardName = styled.strong`
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
`;
const PreviewLogo = styled.img`
  width: var(--avatar-size-sm);
  height: var(--avatar-size-sm);
  border-radius: var(--border-radius-pill);
  object-fit: contain;
`;
const PreviewFallback = styled(CommitteeFallback)``;
const PreviewBody = styled.p<{ $isEmpty: boolean }>`
  margin: 0;
  color: ${({ $isEmpty }) =>
    $isEmpty ? "var(--color-text-muted)" : "var(--color-text-body)"};
  font-size: var(--font-size-sm);
  line-height: var(--line-height-copy);
  white-space: pre-wrap;
  font-style: ${({ $isEmpty }) => ($isEmpty ? "italic" : "normal")};
`;
const PreviewLabel = styled.span`
  margin-top: var(--spacing-xs);
  color: var(--color-text-primary);
  font-size: var(--font-size-detail);
  font-weight: var(--font-weight-semibold);
`;
const PreviewCardAction = styled.span`
  align-self: flex-start;
  color: var(--color-brand);
  font-size: var(--font-size-detail);
  font-weight: var(--font-weight-semibold);
`;
const PreviewInputLabel = styled(PreviewLabel)``;
const PreviewInput = styled.div`
  min-height: 4rem;
  padding: var(--spacing-md);
  border: var(--border-width-default) solid var(--color-border-muted);
  border-radius: var(--border-radius-md);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
`;
