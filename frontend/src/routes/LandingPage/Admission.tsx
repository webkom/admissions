import React from "react";
import styled from "styled-components";
import { isLoggedIn } from "src/utils/djangoData";
import { media } from "src/styles/mediaQueries";
import { Admission as AdmissionInterface } from "src/types";
import AdmissionTimeline, {
  type AdmissionTimelineItem,
} from "src/components/AdmissionTimeline";
import CountDown from "./CountDown";
import LinkButton from "src/components/LinkButton";
import Icon from "src/components/Icon";

interface AdmissionProps {
  admission: AdmissionInterface;
}

const Admission: React.FC<AdmissionProps> = ({ admission }) => {
  const isRevy = admission.slug === "revy";
  const isRevyBoard = admission.slug === "revystyret";
  const isBackup = admission.slug === "backup";
  const isSingleGroupAdmission = admission?.groups.length === 1;
  const isAdmissionMember =
    (admission.userdata.committee_groups?.length ?? 0) > 0;
  const timelineItems: AdmissionTimelineItem[] = [
    {
      title: "Opptaket åpner",
      dateString: admission.open_from,
      details: [],
    },
    {
      title: "Søknadsfrist",
      dateString: admission.public_deadline,
      details: ["Alle søknader er garantert å bli behandlet."],
    },
    {
      title: "Redigeringsfrist",
      dateString: admission.closed_from,
      details: ["Siste frist for redigering og nye søknader."],
    },
  ];

  const now = new Date();
  const nextCountDown = (() => {
    if (new Date(admission.open_from) > now)
      return { title: "Opptaket åpner", dateString: admission.open_from, completedLabel: "Åpnet" };
    if (new Date(admission.public_deadline) > now)
      return { title: "Søknadsfrist", dateString: admission.public_deadline, completedLabel: "Søknadsfrist passert" };
    if (new Date(admission.closed_from) > now)
      return { title: "Redigeringsfrist", dateString: admission.closed_from, completedLabel: "Redigering stengt" };
    return null;
  })();

  return (
    <AdmissionWrapper>
      <AdmissionDetails>
        <div>
          <AdmissionTitle>{admission.title}</AdmissionTitle>
          {admission.description && (
            <AdmissionDescription>
              {admission.description
                .split("\n")
                .map((descriptionLine, index) => (
                  <React.Fragment key={index}>
                    {descriptionLine}
                    <br />
                  </React.Fragment>
                ))}
            </AdmissionDescription>
          )}
          <AdmissionTimeline items={timelineItems} />
        </div>
        <ActionsContainer>
          {nextCountDown && (
            <CountDownSection>
              <CountDown
                title={nextCountDown.title}
                dateString={nextCountDown.dateString}
                completedLabel={nextCountDown.completedLabel}
              />
            </CountDownSection>
          )}

          <LinkWrapper>
            {(admission.is_open || admission.userdata.has_application) && (
              <PrimaryActionButton
                fullWidth
                to={
                  isLoggedIn()
                    ? `/${admission.slug}/` +
                      (admission.userdata.has_application ||
                      isSingleGroupAdmission
                        ? "min-soknad"
                        : "velg-grupper")
                    : "/login/lego/"
                }
                external={!isLoggedIn()}
                disabled={!isLoggedIn() && !admission.is_open}
              >
                <ActionButtonContent>
                  <ActionButtonIcon>
                    <Icon name="paper-plane" size={20} />
                  </ActionButtonIcon>
                  <ActionButtonLabel>Gå til søknad</ActionButtonLabel>
                  <ActionButtonSpacer />
                </ActionButtonContent>
              </PrimaryActionButton>
            )}

            <SecondaryActions>
              {admission.userdata.is_privileged && (
                <SecondaryActionButton
                  fullWidth
                  to={`/${admission.slug}/admin/`}
                >
                  <ActionButtonContent>
                    <ActionButtonIcon>
                      <Icon name="settings" size={18} />
                    </ActionButtonIcon>
                    <ActionButtonLabel>Admin panel</ActionButtonLabel>
                  </ActionButtonContent>
                </SecondaryActionButton>
              )}
            </SecondaryActions>
            <SecondaryActions>
              {isAdmissionMember && (
                <SecondaryActionButton
                  fullWidth
                  to={`/${admission.slug}/schedule/`}
                >
                  <ActionButtonContent>
                    <ActionButtonIcon>
                      <Icon name="calendar" size={18} />
                    </ActionButtonIcon>
                    <ActionButtonLabel>Velg intervjutider</ActionButtonLabel>
                  </ActionButtonContent>
                </SecondaryActionButton>
              )}
              </SecondaryActions>
          </LinkWrapper>
        </ActionsContainer>
      </AdmissionDetails>
      <FooterNote>
        Du kan til enhver tid trekke søknaden din hvis du skulle ombestemme deg.
        Hvis det ikke fungerer å slette søknaden, send en mail til{" "}
        {isRevy || isRevyBoard ? (
          <a href="mailto:revysjef@abakus.no">revysjef@abakus.no</a>
        ) : isBackup ? (
          <a href="mailto:backup-rekruttering@abakus.no">
            backup-rekruttering@abakus.no
          </a>
        ) : (
          <a href="mailto:leder@abakus.no">leder@abakus.no</a>
        )}
        .
      </FooterNote>
      {isRevy && admission.is_open && !isLoggedIn() && (
        <ExternalLinkNote>
          Er du ikke medlem av Abakus? Søk via{" "}
          <a href="https://forms.gle/SKPRvGNwuKhcZQP26">dette skjemaet</a>.
        </ExternalLinkNote>
      )}
      {isRevyBoard && admission.is_open && !isLoggedIn() && (
        <ExternalLinkNote>
          Er du ikke medlem av Abakus? Søk via{" "}
          <a href="https://docs.google.com/forms/d/e/1FAIpQLSdLzkn2RC_CIW3EHPKSn0f60xTP17LdnrvVb1ubVeRVHTsz1A/viewform?usp=sharing">
            dette skjemaet
          </a>
          .
        </ExternalLinkNote>
      )}
    </AdmissionWrapper>
  );
};

export default Admission;

/** Styles **/

const AdmissionWrapper = styled.div`
  background-color: #fff;
  padding: 3.5rem;
  border-radius: var(--border-radius-lg);
  box-shadow:
    0 10px 15px -3px rgba(0, 0, 0, 0.05),
    0 4px 6px -2px rgba(0, 0, 0, 0.02);
  max-width: 1100px;
  width: 100%;
  margin-top: 3rem;
  border: 1px solid #f3f4f6;
  transition: var(--transition-base);

  &:hover {
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.08);
  }

  ${media.portrait`
    padding: 2.5rem;
  `}
  ${media.handheld`
    padding: 1.5rem;
    margin-top: 2rem;
  `}
`;

const AdmissionDetails = styled.div`
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 5rem;
  margin-bottom: 3.5rem;

  ${media.portrait`
    grid-template-columns: 1fr;
    gap: 3.5rem;
  `}
`;

const AdmissionTitle = styled.h2`
  font-size: 2.5rem;
  font-weight: 800;
  margin: 0;
  margin-bottom: 1rem;
  color: #111827;
  letter-spacing: -0.05em;

  ${media.handheld`
    font-size: 1.875rem;
  `}
`;

const AdmissionDescription = styled.p`
  font-size: 1.125rem;
  color: #4b5563;
  line-height: 1.6;
  margin: 0;
  margin-bottom: 3rem;

  ${media.handheld`
    font-size: 1rem;
    margin-bottom: 2rem;
  `}
`;

const ActionsContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
`;

const CountDownSection = styled.div`
  background: #f9fafb;
  padding: 2rem;
  border-radius: var(--border-radius-lg);
  border: 1px solid #f3f4f6;
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
`;

const LinkWrapper = styled.div`
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
`;

const ActionButtonBase = styled(LinkButton)`
  && {
    min-height: 3.5rem;
    border-radius: var(--border-radius-md);
    font-weight: 700;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      color 0.2s ease,
      transform 0.2s ease,
      box-shadow 0.2s ease;
  }
`;

const PrimaryActionButton = styled(ActionButtonBase)`
  && {
    min-height: 3.75rem;
    font-size: 1.0625rem;
    background: var(--lego-red-color);
    color: white;
    border: 2px solid var(--lego-red-color);

    &:hover:not(:disabled) {
      background: #8e0e06;
      border-color: #8e0e06;
      transform: translateY(-2px);
      box-shadow: 0 10px 15px -3px rgba(178, 18, 7, 0.2);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
`;

const SecondaryActions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
  align-items: stretch;
`;

const SecondaryActionButton = styled(ActionButtonBase)`
  && {
    min-height: 3.5rem;
    font-size: 0.875rem;
    background: white;
    color: var(--lego-red-color);
    border: 2px solid var(--lego-red-color);

    &:hover:not(:disabled) {
      background: #fff5f5;
      transform: translateY(-1px);
    }
  }
`;

const ActionButtonContent = styled.span`
  display: grid;
  grid-template-columns: 1.25rem minmax(0, 1fr) 1.25rem;
  align-items: center;
  width: 100%;
`;

const ActionButtonIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
`;

const ActionButtonLabel = styled.span`
  text-align: center;
`;

const ActionButtonSpacer = styled.span`
  width: 1.25rem;
  height: 1.25rem;
  visibility: hidden;
`;

const FooterNote = styled.p`
  font-size: 0.875rem;
  color: #9ca3af;
  margin: 0;
  padding-top: 2rem;
  border-top: 1px solid #f3f4f6;
  li a {
    color: #6b7280;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 2px;

    &:hover {
      color: #111827;
    }
  }
`;

const ExternalLinkNote = styled(FooterNote)`
  border-top: none;
  padding-top: 1rem;
`;
