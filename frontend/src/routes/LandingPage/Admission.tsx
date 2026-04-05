import React from "react";
import styled from "styled-components";
import { isLoggedIn } from "src/utils/djangoData";
import { media } from "src/styles/mediaQueries";
import FormatTime from "src/components/Time/FormatTime";
import { Admission as AdmissionInterface } from "src/types";
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

  return (
    <AdmissionWrapper>
      <AdmissionDetails>
        <TimeLineWrapper>
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
          {!admission.is_open && !admission.is_closed && (
            <TimeLineItem
              title="Opptaket åpner"
              dateString={admission.open_from}
              details={[]}
            />
          )}
          <TimeLineItem
            title="Søknadsfrist"
            dateString={admission.public_deadline}
            details={["Alle søknader er garantert å bli behandlet."]}
          />
          {(admission.is_open || admission.is_closed) && (
            <TimeLineItem
              title="Redigeringsfrist"
              dateString={admission.closed_from}
              details={["Siste frist for redigering og nye søknader."]}
            />
          )}
        </TimeLineWrapper>
        <ActionsContainer>
          <CountDownSection>
            {!admission.is_open && !admission.is_closed && (
              <CountDown title="Åpner om" dateString={admission.open_from} />
            )}
            {admission.is_appliable && (
              <CountDown
                title="Frist om"
                dateString={admission.public_deadline}
              />
            )}
            {!admission.is_appliable && admission.is_open && (
              <CountDown
                title="Stenger om"
                dateString={admission.closed_from}
              />
            )}
          </CountDownSection>

          <LinkWrapper>
            {(admission.is_open || admission.userdata.has_application) && (
              <PrimaryAction>
                <LinkButton
                  dark
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
                  <Icon name="paper-plane" size={20} />
                  Gå til søknad
                </LinkButton>
              </PrimaryAction>
            )}

            <SecondaryActions>
              {admission.userdata.is_privileged && (
                <LinkButton secondary to={`/${admission.slug}/admin/`}>
                  <Icon name="settings" size={18} />
                  Admin panel
                </LinkButton>
              )}
              {isAdmissionMember && (
                <LinkButton secondary to={`/${admission.slug}/schedule/`}>
                  <Icon name="calendar" size={18} />
                  Velg intervjutider
                </LinkButton>
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

interface TimeLineItemProps {
  dateString: string;
  title: string;
  details: string[];
}

const TimeLineItem: React.FC<TimeLineItemProps> = ({
  dateString,
  title,
  details,
}) => {
  const dateHasPassed = new Date().toISOString().localeCompare(dateString) > 0;
  return (
    <TimeLineItemWrapper $dateHasPassed={dateHasPassed}>
      <TimeLineItemIcon $dateHasPassed={dateHasPassed} />
      <TimeLineItemContent>
        <TimeLineItemTitle $dateHasPassed={dateHasPassed}>
          {title}
        </TimeLineItemTitle>
        <TimeLineItemTime>
          <Icon name="time" size={14} />
          <FormatTime format="EEEE d. MMMM HH:mm:ss">{dateString}</FormatTime>
        </TimeLineItemTime>
        {details.map((detail, index) => (
          <TimeLineItemDetail key={index}>{detail}</TimeLineItemDetail>
        ))}
      </TimeLineItemContent>
    </TimeLineItemWrapper>
  );
};

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

const TimeLineWrapper = styled.div``;

interface StyledTimeLineItemProps {
  $dateHasPassed: boolean;
}

const TimeLineItemWrapper = styled.div<StyledTimeLineItemProps>`
  display: flex;
  position: relative;
  padding-left: 3rem;
  margin-bottom: 2.5rem;

  &:last-child {
    margin-bottom: 0;
  }

  &:not(:last-of-type)::after {
    content: "";
    position: absolute;
    left: 11px;
    top: 32px;
    bottom: -24px;
    width: 2px;
    background: #fecaca;
  }
`;

const TimeLineItemIcon = styled.div<{ $dateHasPassed: boolean }>`
  position: absolute;
  left: 0;
  top: 4px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background-color: ${(props) =>
    props.$dateHasPassed ? "#e5e7eb" : "var(--lego-red-color)"};
  border: 4px solid #fff;
  box-shadow: 0 0 0 1px
    ${(props) => (props.$dateHasPassed ? "#e5e7eb" : "var(--lego-red-color)")};
  z-index: 1;
`;

const TimeLineItemContent = styled.div`
  display: flex;
  flex-direction: column;
`;

const TimeLineItemTitle = styled.span<{ $dateHasPassed: boolean }>`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${(props) => (props.$dateHasPassed ? "#9ca3af" : "#111827")};

  ${media.handheld`
    font-size: 1rem;
  `}
`;

const TimeLineItemTime = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: #6b7280;
  margin-top: 0.25rem;

  i {
    color: #9ca3af;
  }
`;

const TimeLineItemDetail = styled.span`
  color: #9ca3af;
  font-size: 0.875rem;
  margin-top: 0.75rem;
  line-height: 1.5;
  max-width: 400px;
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
`;

const LinkWrapper = styled.div`
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
`;

const PrimaryAction = styled.div`
  width: 100%;

  button,
  a {
    width: 100% !important;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    gap: 0.75rem !important;
    height: 3.75rem !important;
    font-size: 1.125rem !important;
    font-weight: 700 !important;
    border-radius: var(--border-radius-md) !important;
    background: var(--lego-red-color) !important;
    color: white !important;
    border: 2px solid var(--lego-red-color) !important;
    transition: all 0.2s ease !important;
    cursor: pointer;
    position: relative;

    &::before {
      content: "";
      width: 0.625rem;
      height: 0.625rem;
      border-radius: 50%;
      background: currentColor;
      display: inline-block;
      flex-shrink: 0;
      opacity: 0.8;
    }

    &:hover:not(:disabled) {
      background: #8e0e06 !important;
      border-color: #8e0e06 !important;
      transform: translateY(-2px) !important;
      box-shadow: 0 10px 15px -3px rgba(178, 18, 7, 0.2) !important;
    }

    &:active {
      transform: translateY(0) !important;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
`;

const SecondaryActions = styled.div`
  display: grid;
  gap: 0.75rem;
  width: 100%;

  button,
  a {
    width: 100% !important;
    display: flex !important;
    justify-content: center !important;
    align-items: center !important;
    gap: 0.625rem !important;
    height: 3.5rem !important;
    font-size: 0.875rem !important;
    font-weight: 700 !important;
    border-radius: var(--border-radius-md) !important;
    background: white !important;
    color: var(--lego-red-color) !important;
    border: 2px solid var(--lego-red-color) !important;
    transition: all 0.2s ease !important;
    cursor: pointer;
    position: relative;

    &::before {
      content: "";
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: currentColor;
      display: inline-block;
      flex-shrink: 0;
      opacity: 0.8;
    }

    &:hover:not(:disabled) {
      background: #fff5f5 !important;
      transform: translateY(-1px) !important;
    }
  }
`;

const FooterNote = styled.p`
  font-size: 0.875rem;
  color: #9ca3af;
  margin: 0;
  padding-top: 2rem;
  border-top: 1px solid #f3f4f6;
  line-height: 1.6;

  a {
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
