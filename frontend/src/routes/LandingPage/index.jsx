import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useAdmission, useMyApplication } from "../../query/hooks";

import djangoData from "src/utils/djangoData";
import DecorativeLine from "src/components/DecorativeLine";
import LegoButton from "src/components/LegoButton";
import LandingPageSkeleton from "./LandingPageSkeleton";
import LandingPageNoAdmission from "./LandingPageNoAdmission";
import { media } from "src/styles/mediaQueries";
import FormatTime from "src/components/Time/FormatTime";
import AdmissionCountDown from "../../components/AdmissionCountDown";

import LoadingBall from "src/components/LoadingBall";

const LandingPage = () => {
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const {
    data: admission,
    error: admissionError,
    isFetching: admissionIsFetching,
  } = useAdmission();
  const {
    data: myApplication,
    error: myApplicationError,
    isFetching: myApplicationIsFetching,
  } = useMyApplication();

  useEffect(() => {
    setHasSubmitted(!!myApplication);
  }, [myApplication]);

  if (admissionError || myApplicationError) {
    return (
      <div>
        Error: {admissionError} {myApplicationError}
      </div>
    );
  }

  if (admissionIsFetching || myApplicationIsFetching) {
    return <LoadingBall />;
  }

  if (!admission) {
    return <LandingPageNoAdmission />;
  }

  return (
    <LandingPageSkeleton>
      <YearOfAdmission>2023</YearOfAdmission>
      <InfoBox>
        <DecorativeLine vertical red />
        <ApplicationDateInfo admission={admission} />
      </InfoBox>
      <Notice>
        <StyledSpan bold>Merk:</StyledSpan> Oppdateringer etter søknadsfristen
        kan ikke garanteres å bli sett av revystyret.
      </Notice>
      {admission.is_open && !djangoData.user.full_name && (
        <Notice>
          Er du ikke medlem av Abakus? Søk via{" "}
          <a href="https://docs.google.com/forms/d/e/1FAIpQLSfsR40RJxjvv23BUeK7wrz8j5BxxLWJwC3DO8eLrABsJFOwzQ/viewform?usp=sf_link">
            dette skjemaet
          </a>
          .
        </Notice>
      )}
      <LinkWrapper>
        {djangoData.user.full_name ? (
          <li>
            <LegoButton
              to={hasSubmitted ? "/min-soknad" : "/velg-grupper"}
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
                window.location = "/login/lego/";
                e.preventDefault();
              }}
            >
              Gå til søknad
            </LegoButton>
          </li>
        )}

        {djangoData.user.is_privileged && (
          <li>
            <LegoButton
              to="/admin"
              icon="arrow-forward"
              iconPrefix="ios"
              buttonStyle="secondary"
            >
              Gå til admin panel
            </LegoButton>
          </li>
        )}
      </LinkWrapper>
      {!admission.is_open && (
        <AdmissionCountDown endTime={admission.open_from} />
      )}
    </LandingPageSkeleton>
  );
};

export default LandingPage;

const ApplicationDateInfo = ({ admission }) => (
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

const YearOfAdmission = styled.h1`
  color: #aeaeae;
  font-size: 2.5rem;
  font-weight: 500;
`;

const InfoBox = styled.div`
  display: flex;
  max-width: 600px;
  margin-top: 40px;
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

const StyledSpan = styled.span.attrs((props) => ({
  red: props.red ? true : false,
  bold: props.bold ? "600" : "normal",
}))`
  color: ${(props) => (props.red ? "var(--lego-red)" : "inherit")};
  font-weight: ${(props) => props.bold};
`;

const Notice = styled.p`
  font-style: italic;
  font-size: 1rem;
  max-width: 600px;
  width: 600px;
  line-height: 1.4rem;

  ${media.handheld`
    margin: 0 0;
    font-size: 0.9rem;
    line-height: 1.1rem;
    max-width: 300px;
  `}
`;

const LinkWrapper = styled.ul`
  margin-top: 1.5rem;
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
