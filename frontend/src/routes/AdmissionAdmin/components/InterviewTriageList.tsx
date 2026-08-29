import React from "react";
import styled from "styled-components";
import { ChevronDown, MessageCircle, Phone } from "lucide-react";
import InterviewStatusControl from "src/containers/AdmissionsContainer/InterviewStatusControl";
import ApplicationDetails from "src/containers/AdmissionsContainer/ApplicationDetails";
import { Admission, AdminApplication } from "src/types";
import { breakpoints, iconSizes } from "src/styles/designTokens";
import { encodeSmsAddress } from "src/utils/emailLinks";
import { getApplicationDeadlineStatus } from "src/utils/applicationAccess";
import FormatTime from "src/components/Time/FormatTime";
import { DateTime } from "luxon";
import {
  hasApplicationDetails,
  isFullAdminApplication,
} from "src/utils/applicationAccess";

interface InterviewTriageListProps {
  admission: Admission;
  applications: AdminApplication[];
  applicationScopeKey: string;
}

const formatGroupNames = (application: AdminApplication): string => {
  const names = application.group_applications.map(({ group }) => group.name);
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
};

const InterviewTriageList: React.FC<InterviewTriageListProps> = ({
  admission,
  applications,
  applicationScopeKey,
}) => {
  const [expandedApplicationIds, setExpandedApplicationIds] = React.useState<
    Set<string>
  >(new Set());

  const toggleApplication = (applicationId: string) => {
    setExpandedApplicationIds((current) => {
      const next = new Set(current);
      if (next.has(applicationId)) next.delete(applicationId);
      else next.add(applicationId);
      return next;
    });
  };

  return (
    <MobileSection aria-label="Søknader">
      <CardList>
        {applications.map((application) => {
          const phone = application.phone_number.trim();
          const phoneRecipient = encodeSmsAddress(phone);
          const fullApplication = isFullAdminApplication(application)
            ? application
            : undefined;
          const applicationWithDetails = hasApplicationDetails(application)
            ? application
            : undefined;
          const isExpanded =
            Boolean(applicationWithDetails) &&
            expandedApplicationIds.has(application.pk);
          const identity = (
            <div>
              <CandidateName>{application.user.full_name}</CandidateName>
              {fullApplication && (
                <Username>@{fullApplication.user.username}</Username>
              )}
              <Groups
                title={application.group_applications
                  .map(({ group }) => group.name)
                  .join(", ")}
              >
                {formatGroupNames(application)}
              </Groups>
            </div>
          );

          return (
            <CandidateCard key={application.pk} $expanded={isExpanded}>
              {applicationWithDetails ? (
                <CandidateToggle
                  type="button"
                  aria-expanded={isExpanded}
                  aria-controls={`mobile-application-${application.pk}`}
                  onClick={() => toggleApplication(application.pk)}
                >
                  {identity}
                  <ChevronDown
                    size={iconSizes.standard}
                    aria-hidden="true"
                    data-expanded={isExpanded}
                  />
                </CandidateToggle>
              ) : (
                <CandidateHeader>{identity}</CandidateHeader>
              )}

              <CandidateSummary>
                <InterviewStatusControl
                  admissionSlug={admission.slug}
                  applicationScopeKey={applicationScopeKey}
                  applicationId={application.pk}
                  candidateName={application.user.full_name}
                  status={application.interview_status}
                  statusUpdatedAt={application.interview_status_updated_at}
                  statusUpdatedBy={
                    fullApplication?.interview_status_updated_by ?? ""
                  }
                  canEdit={
                    admission.userdata.is_admin ||
                    admission.userdata.is_recruiter
                  }
                  compact
                />

                {applicationWithDetails && (
                  <div
                    title={`Sendt: ${DateTime.fromISO(
                      applicationWithDetails.created_at,
                    )
                      .setLocale("nb")
                      .toFormat("EEEE d. MMMM yyyy, kl. HH:mm")}`}
                    className="flex flex-col items-end gap-0.5 leading-tight"
                  >
                    <div className="flex items-center gap-1.5 tabular-nums whitespace-nowrap text-ui">
                      <span className="font-medium text-text-primary">
                        <FormatTime format="d. LLL">
                          {applicationWithDetails.created_at}
                        </FormatTime>
                      </span>
                      <span className="text-xs text-text-muted/60">–</span>
                      <span className="text-text-muted">
                        <FormatTime format="HH:mm">
                          {applicationWithDetails.created_at}
                        </FormatTime>
                      </span>
                    </div>
                    <SentMeta
                      data-cy="application-sent-time"
                      data-late={
                        !applicationWithDetails.applied_within_deadline
                      }
                      className={
                        applicationWithDetails.applied_within_deadline
                          ? "text-success"
                          : "text-orange-500"
                      }
                    >
                      {getApplicationDeadlineStatus(
                        applicationWithDetails.applied_within_deadline,
                      )}
                    </SentMeta>
                  </div>
                )}
              </CandidateSummary>

              {phoneRecipient && (
                <ContactActions>
                  <ContactNumber>{phone}</ContactNumber>
                  <ContactLink
                    href={`tel:${phoneRecipient}`}
                    aria-label={`Ring ${application.user.full_name}`}
                    title={`Ring ${application.user.full_name}`}
                  >
                    <Phone size={iconSizes.control} aria-hidden="true" />
                  </ContactLink>
                  <ContactLink
                    href={`sms:${phoneRecipient}`}
                    aria-label={`Send melding til ${application.user.full_name}`}
                    title={`Send melding til ${application.user.full_name}`}
                  >
                    <MessageCircle
                      size={iconSizes.control}
                      aria-hidden="true"
                    />
                  </ContactLink>
                </ContactActions>
              )}

              {isExpanded && applicationWithDetails && (
                <ExpandedContent id={`mobile-application-${application.pk}`}>
                  <ApplicationDetails
                    admission={admission}
                    application={applicationWithDetails}
                    allowGroupDeletion={Boolean(fullApplication)}
                  />
                </ExpandedContent>
              )}
            </CandidateCard>
          );
        })}
      </CardList>
    </MobileSection>
  );
};

export default InterviewTriageList;

const MobileSection = styled.section`
  display: none;

  @media screen and (max-width: ${breakpoints.handheld}) {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }
`;

const CardList = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
`;

const CandidateCard = styled.article<{ $expanded: boolean }>`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-md);
  background: ${({ $expanded }) =>
    $expanded ? "var(--color-surface-subtle)" : "var(--color-surface-base)"};
`;

const CandidateToggle = styled.button`
  display: flex;
  width: 100%;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;

  svg {
    flex: 0 0 auto;
    margin-top: var(--spacing-xs);
    color: var(--color-text-muted);
    transition: transform var(--easing-fast);
  }

  svg[data-expanded="true"] {
    transform: rotate(180deg);
  }

  &:focus-visible {
    border-radius: var(--border-radius-sm);
    outline: none;
    box-shadow: 0 0 0 3px var(--color-brand-ring-soft);
  }
`;

const CandidateHeader = styled.div`
  display: flex;
  width: 100%;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
`;

const CandidateName = styled.h3`
  margin: 0;
  color: var(--color-text-primary);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
`;

const Username = styled.span`
  display: block;
  margin-top: var(--spacing-xs);
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
`;

const Groups = styled.p`
  margin: var(--spacing-xs) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
`;

const CandidateSummary = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--spacing-md);
`;

const SentMeta = styled.span`
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-detail);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

const ContactActions = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--spacing-sm);
`;

const ContactNumber = styled.span`
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: var(--font-size-ui);
  font-weight: var(--font-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ContactLink = styled.a`
  display: inline-flex;
  width: var(--control-height-md);
  min-height: var(--control-height-md);
  align-items: center;
  justify-content: center;
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-subtle);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-decoration: none;

  &:hover {
    border-color: var(--color-brand);
    color: var(--color-brand);
  }

  &:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--color-brand-ring-soft);
  }
`;

const ExpandedContent = styled.div`
  padding-top: var(--spacing-lg);
  border-top: var(--border-width-default) solid var(--color-border-soft);
`;
