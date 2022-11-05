import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useAdmissions, useMyApplication } from "src/query/hooks";

import djangoData from "src/utils/djangoData";
import DecorativeLine from "src/components/DecorativeLine";
import LegoButton from "src/components/LegoButton";
import LandingPageSkeleton from "./LandingPageSkeleton";
import LandingPageNoAdmission from "./LandingPageNoAdmission";
import { media } from "src/styles/mediaQueries";
import FormatTime from "src/components/Time/FormatTime";
import AdmissionCountDown from "../../components/AdmissionCountDown";

import LoadingBall from "src/components/LoadingBall";
import { useParams } from "react-router-dom";
import { Admission as AdmissionInterface } from "src/types";

const LandingPage = () => {
  const { admissionId } = useParams();
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const {
    data: admissions,
    error: admissionError,
    isFetching: admissionIsFetching,
  } = useAdmissions();
  const {
    data: myApplication,
    error: myApplicationError,
    isFetching: myApplicationIsFetching,
  } = useMyApplication(admissionId ?? "");

  useEffect(() => {
    setHasSubmitted(!!myApplication);
  }, [myApplication]);

  if (admissionError || myApplicationError) {
    return (
      <div>
        Error: {admissionError?.message} {myApplicationError?.message}
      </div>
    );
  }

  if (admissionIsFetching || myApplicationIsFetching) {
    return <LoadingBall />;
  }

  if (!admissions || admissions.length === 0) {
    return <LandingPageNoAdmission />;
  }

  return (
    <LandingPageSkeleton>
      {admissions.map((admission) => (
        <Admission key={admission.pk}>
          <AdmissionTitle>{admission.title}</AdmissionTitle>

          <InfoBox>
            <DecorativeLine vertical red />
            <div>
              <ApplicationDateInfo admission={admission} />
            </div>
          </InfoBox>
          {admission.is_open && (
            <Notice>
              <StyledSpan bold>Merk:</StyledSpan> Oppdateringer etter
              søknadsfristen kan ikke garanteres å bli sett av komiteen(e) du
              søker deg til.
            </Notice>
          )}
          {!admission.is_open && (
            <AdmissionCountDown endTime={admission.open_from} />
          )}
          <LinkWrapper>
            {admission.is_open &&
              (djangoData.user.full_name ? (
                <li>
                  <LegoButton
                    to={
                      `/${admission.pk}/` +
                      (hasSubmitted ? "min-soknad" : "velg-komiteer")
                    }
                    icon="arrow-forward"
                    iconPrefix="ios"
                    disabled={!admission.is_open}
                  >
                    Gå til søknad
                  </LegoButton>
                </li>
              ) : (
                <li>
                  <LegoButton
                    icon="arrow-forward"
                    iconPrefix="ios"
                    disabled={!admission.is_open}
                    onClick={(e) => {
                      (window as Window).location = "/login/lego/";
                      e.preventDefault();
                    }}
                  >
                    Gå til søknad
                  </LegoButton>
                </li>
              ))}

            {djangoData.user.is_privileged && (
              <li>
                <LegoButton
                  to={`/${admission.pk}/admin/`}
                  icon="arrow-forward"
                  iconPrefix="ios"
                  buttonStyle="secondary"
                >
                  Gå til admin panel
                </LegoButton>
              </li>
            )}
          </LinkWrapper>
        </Admission>
      ))}
    </LandingPageSkeleton>
  );
};

export default LandingPage;

interface ApplicationDateInfoProps {
  admission: AdmissionInterface;
}

const ApplicationDateInfo: React.FC<ApplicationDateInfoProps> = ({
  admission,
}) => (
  <div>
    <p>
      Siste frist for å <StyledSpan bold>legge inn en søknad</StyledSpan> er{" "}
      <StyledSpan bold red>
        <FormatTime format="EEEE d. MMMM">
          {admission.public_deadline}
        </FormatTime>
      </StyledSpan>
      <StyledSpan red>
        <FormatTime format=", kl. HH:mm:ss">
          {admission.public_deadline}
        </FormatTime>
      </StyledSpan>
      .
    </p>
  </div>
);

/** Styles **/

const Admission = styled.div`
  width: 100%;
  max-width: 600px;
  margin-top: 40px;
`;

const AdmissionTitle = styled.h2`
  font-size: 28px;
  margin: 0;
`;

const InfoBox = styled.div`
  display: flex;
  max-width: 600px;
  margin-top: 1em;
  p {
    margin: 0 0 0 1rem;
    font-size: 1.1rem;
    line-height: 1.6rem;
    padding: 7px 0;
  }

  ${media.handheld`
    margin: 1rem 0 1.6rem 0;
    max-width: 300px;

    p {
    font-size: 1rem;
    line-height: 1.3rem;
  `};
`;

interface StyledSpanProps {
  red?: boolean;
  bold?: boolean;
}

const StyledSpan = styled.span<StyledSpanProps>`
  color: ${(props) => (props.red ? "var(--lego-red)" : "inherit")};
  font-weight: ${(props) => (props.bold ? 600 : "normal")};
`;

const Notice = styled.p`
  font-style: italic;
  font-size: 1rem;
  max-width: 600px;
  line-height: 1.4rem;

  ${media.handheld`
    margin: 0 0;
    font-size: 0.9rem;
    line-height: 1.1rem;
    max-width: 300px;
  `}
`;

const LinkWrapper = styled.ul`
  margin-top: 0;
  margin-bottom: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;

  > li:last-child {
    margin-top: 1rem;
  }

  ${media.handheld`
    margin-top: 2.5rem;
    margin-bottom: 1rem;
  `}
`;
