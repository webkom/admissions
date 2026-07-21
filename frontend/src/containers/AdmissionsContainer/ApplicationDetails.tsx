import React from "react";
import styled from "styled-components";
import DeleteApplication from "src/components/DeleteApplication";
import FormatTime from "src/components/Time/FormatTime";
import { MoreHorizontal } from "lucide-react";
import type { Admission, AdminApplication } from "src/types";
import type { InputFieldModel } from "src/utils/jsonFields";
import { iconSizes } from "src/styles/designTokens";

export interface ApplicationDetailsProps {
  admission: Admission;
  application: AdminApplication;
}

const formatResponse = (value: unknown): string => {
  if (typeof value === "boolean") return value ? "Ja" : "Nei";
  return typeof value === "string" && value.trim() ? value : "Ikke besvart";
};

const ApplicationDetails: React.FC<ApplicationDetailsProps> = ({
  admission,
  application,
}) => {
  const candidateName = application.user.full_name;
  return (
    <DetailsContent>
      {application.group_applications.map((groupApplication) => {
        const groupFields = (
          admission.groups.find(
            (group) => group.pk === groupApplication.group.pk,
          )?.header_fields ?? []
        ).filter((field): field is InputFieldModel => "id" in field);
        const groupText = groupApplication.text.trim();
        const hasGroupContent = groupFields.length > 0 || groupText.length > 0;

        return (
          <DetailSection key={groupApplication.group.pk}>
            <SectionHeader>
              <SectionHeading>{groupApplication.group.name}</SectionHeading>
              <ApplicationActions>
                <details>
                  <summary
                    aria-label={`Flere handlinger for søknaden fra ${candidateName} til ${groupApplication.group.name}`}
                    title={`Flere handlinger for ${candidateName} · ${groupApplication.group.name}`}
                  >
                    <MoreHorizontal
                      size={iconSizes.standard}
                      aria-hidden="true"
                    />
                  </summary>
                  <ActionMenu role="menu">
                    <DeleteApplication
                      applicationId={application.pk}
                      groupId={groupApplication.group.pk}
                      candidateName={candidateName}
                      groupName={groupApplication.group.name}
                      menuItem
                    />
                  </ActionMenu>
                </details>
              </ApplicationActions>
            </SectionHeader>
            {groupFields.length > 0 && (
              <AnswerList>
                {groupFields.map((field) => (
                  <div key={field.id}>
                    <dt>{field.title}</dt>
                    <dd>
                      {formatResponse(
                        groupApplication.header_fields_response?.[field.id],
                      )}
                    </dd>
                  </div>
                ))}
              </AnswerList>
            )}
            {groupText && (
              <TextResponse>
                <ResponseLabel>
                  {groupApplication.group.response_label || "Søknadstekst"}
                </ResponseLabel>
                <ApplicationText>{groupText}</ApplicationText>
              </TextResponse>
            )}
            {!hasGroupContent && (
              <EmptyApplication>
                Ingen svar eller søknadstekst.
              </EmptyApplication>
            )}
          </DetailSection>
        );
      })}

      <ApplicationMetadata>
        <span>
          Sendt{" "}
          <FormatTime format="d. MMMM HH:mm">
            {application.created_at}
          </FormatTime>
        </span>
        <span aria-hidden="true">-</span>
        <span>
          Søknaden sist endret{" "}
          <FormatTime format="d. MMMM HH:mm">
            {application.updated_at}
          </FormatTime>
        </span>
      </ApplicationMetadata>
    </DetailsContent>
  );
};

export default ApplicationDetails;

const DetailsContent = styled.div`
  max-width: var(--content-width-readable);
`;

const DetailSection = styled.section`
  padding: 0 0 var(--spacing-lg);

  & + & {
    padding-top: var(--spacing-lg);
    border-top: var(--border-width-default) solid var(--color-border-soft);
  }
`;

const SectionHeader = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
`;

const SectionHeading = styled.h3`
  margin: 0 0 var(--spacing-md);
  color: var(--color-text-primary);
  font-size: var(--font-size-heading-sm);
  font-weight: var(--font-weight-semibold);

  ${SectionHeader} & {
    margin-bottom: 0;
  }
`;

const ResponseLabel = styled.span`
  display: block;
  margin-bottom: var(--spacing-xs);
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
  font-weight: var(--font-weight-semibold);
`;

const AnswerList = styled.dl`
  display: grid;
  gap: var(--spacing-md);
  margin: 0;

  div {
    display: grid;
    gap: var(--spacing-xs);
  }

  dt,
  ${ResponseLabel} {
    color: var(--color-text-muted);
    font-size: var(--font-size-detail);
    font-weight: var(--font-weight-semibold);
  }

  dd {
    margin: 0;
    color: var(--color-text-primary);
    line-height: var(--line-height-base);
    white-space: pre-wrap;
  }
`;

const TextResponse = styled.div`
  margin-top: var(--spacing-lg);
`;

const ApplicationText = styled.p`
  margin: 0;
  color: var(--color-text-primary);
  line-height: var(--line-height-base);
  white-space: pre-wrap;
`;

const EmptyApplication = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-style: italic;
`;

const ApplicationActions = styled.div`
  flex: 0 0 auto;

  details {
    position: relative;
  }

  summary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--control-height-sm);
    height: var(--control-height-sm);
    border-radius: var(--border-radius-sm);
    color: var(--color-text-muted);
    cursor: pointer;
    list-style: none;

    &::-webkit-details-marker {
      display: none;
    }

    &:hover {
      background: var(--color-surface-subtle);
      color: var(--color-text-primary);
    }

    &:focus-visible {
      outline: none;
      box-shadow: 0 0 0 3px var(--color-brand-ring-soft);
    }
  }
`;

const ActionMenu = styled.div`
  position: absolute;
  z-index: var(--popover-layer);
  top: calc(100% + var(--spacing-xs));
  right: 0;
  min-width: 15rem;
  padding: var(--spacing-xs);
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-base);
  box-shadow: var(--shadow-md);
`;

const ApplicationMetadata = styled.footer`
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs);
  padding-top: var(--spacing-md);
  border-top: var(--border-width-default) solid var(--color-border-soft);
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
  font-variant-numeric: tabular-nums;
`;
