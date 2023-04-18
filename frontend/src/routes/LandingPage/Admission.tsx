import React, { useEffect, useState } from "react";
import styled from "styled-components";
import djangoData from "src/utils/djangoData";
import LegoButton from "src/components/LegoButton";
import { media } from "src/styles/mediaQueries";
import FormatTime from "src/components/Time/FormatTime";
import { useMyApplication } from "src/query/hooks";
import { Admission as AdmissionInterface } from "src/types";
import CountDown from "./CountDown";

interface AdmissionProps {
  admission: AdmissionInterface;
}

const Admission: React.FC<AdmissionProps> = ({ admission }) => {
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const { data: myApplication } = useMyApplication(admission.pk);

  useEffect(() => {
    setHasSubmitted(!!myApplication);
  }, [myApplication]);

  return (
    <AdmissionWrapper>
      <AdmissionDetails>
        <TimeLineWrapper>
          <AdmissionTitle>{admission.title}</AdmissionTitle>
          <AdmissionDescription>
            {admission.description.split("\n").map((descriptionLine, index) => (
              <React.Fragment key={index}>
                {descriptionLine}
                <br />
              </React.Fragment>
            ))}
          </AdmissionDescription>
          {!admission.is_open && (
            <TimeLineItem
              title="Opptaket åpner"
              dateString={admission.open_from}
              details={[]}
            />
          )}
          <TimeLineItem
            title="Søknadsfrist"
            dateString={admission.public_deadline}
            details={["Alle søknader er garantert å behandlet."]}
          />
          {admission.is_open && (
            <TimeLineItem
              title="Redigeringsfrist"
              dateString={admission.application_deadline}
              details={[
                "Du kan fortsatt søke og redigere søknaden din, men det er ikke sikkert at de som behandler søknaden får det med seg.",
                "Etter redigeringsfristen vil du ikke lenger kunne se søknaden din.",
              ]}
            />
          )}
        </TimeLineWrapper>
        <CountDownWrapper>
          {!admission.is_open && !admission.is_closed && (
            <CountDown
              title="Opptaket åpner om"
              dateString={admission.open_from}
            />
          )}
          {admission.is_appliable && (
            <CountDown
              title="Søknadsfrist om"
              dateString={admission.public_deadline}
            />
          )}
          {!admission.is_appliable && admission.is_open && (
            <CountDown
              title="Redigeringsfrist om"
              dateString={admission.application_deadline}
            />
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
        </CountDownWrapper>
      </AdmissionDetails>
      <p>
        Du kan til enhver tid trekke søknaden din hvis du skulle ombestemme deg.
        Hvis det ikke fungerer å slette søknaden, send en mail til{" "}
        <a href="mailto:leder@abakus.no">leder@abakus.no</a>.
      </p>
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
    <TimeLineItemWrapper dateHasPassed={dateHasPassed}>
      <TimeLineItemIcon />
      <TimeLineItemTitle>{title}</TimeLineItemTitle>
      <TimeLineItemTime>
        <FormatTime format="EEEE d. MMMM HH:mm:ss">{dateString}</FormatTime>
      </TimeLineItemTime>
      {details.map((detail, index) => (
        <TimeLineItemDetail key={index}>{detail}</TimeLineItemDetail>
      ))}
    </TimeLineItemWrapper>
  );
};

/** Styles **/

const AdmissionWrapper = styled.div`
  background-color: #fff;
  padding: 2em 2.5em;
  max-width: 1200px;
  margin-top: 30px;
  ${media.portrait`
    padding: 1.5em 2em;
  `}
  ${media.handheld`
    padding: 0.2em 0.5em 0.5em;
    margin-top: 1em;
  `}
`;

const AdmissionDetails = styled.div`
  display: flex;

  ${media.portrait`
    flex-direction: column;
  `}
`;

const AdmissionTitle = styled.h2`
  font-size: 28px;
  margin: 0;
  ${media.handheld`
    font-size: 1.5rem;
  `}
`;

const AdmissionDescription = styled.p`
  font-size: 1.1rem;
  margin: 0;
  margin-bottom: 1em;
  ${media.handheld`
    font-size: 1rem;
    line-height: 1.6;
    margin-bottom: 0.5em;
  `}
`;

const TimeLineWrapper = styled.div`
  flex-basis: 50%;
`;

interface StyledTimeLineItemProps {
  dateHasPassed: boolean;
}

const TimeLineItemWrapper = styled.div<StyledTimeLineItemProps>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 10px;
  opacity: ${(props) => (props.dateHasPassed ? 0.6 : 1)};
`;

const TimeLineItemIcon = styled.i`
  display: inline-block;
  width: 25px;
  height: 25px;
  border-radius: 12.5px;
  background-color: var(--abakus-red);
  margin-right: 10px;
  ${media.handheld`
    width: 20px;
    height: 20px;
    border-radius: 10px;
  `}
`;

const TimeLineItemHeader = styled.span``;

const TimeLineItemTitle = styled(TimeLineItemHeader)`
  font-size: 18px;
  font-weight: 500;
  flex-grow: 1;
  ${media.handheld`
    font-size: 1.05rem;
  `}
`;

const TimeLineItemTime = styled(TimeLineItemHeader)`
  font-size: 16px;
  font-weight: 500;
  line-height: 1;
  flex-basis: 100%;
  margin-left: 35px;
  margin-bottom: 5px;
  ${media.handheld`
    font-size: 1rem;
    margin-left: 30px;
  `}
`;

const TimeLineItemDetail = styled.span`
  flex-basis: 100%;
  margin-left: 35px;
  margin-top: 6px;
  line-height: 1.4;
  ${media.handheld`
    font-size: 0.95rem;
    margin-left: 30px;
  `}
`;

const CountDownWrapper = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex-basis: 50%;
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
    margin-bottom: 1rem;
  `}
`;
