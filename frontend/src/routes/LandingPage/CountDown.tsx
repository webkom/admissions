import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

interface CountDownProps {
  title: string;
  dateString: string;
  completedLabel?: string;
}

const CountDown: React.FC<CountDownProps> = ({
  title,
  dateString,
  completedLabel = "Passert",
}) => {
  const [remainingTotalSeconds, setRemainingTotalSeconds] = useState(() =>
    getRemainingSeconds(dateString),
  );

  useEffect(() => {
    setRemainingTotalSeconds(getRemainingSeconds(dateString));

    const interval = setInterval(() => {
      setRemainingTotalSeconds(getRemainingSeconds(dateString));
    }, 1000);

    return () => clearInterval(interval);
  }, [dateString]);

  const remaining = calculateRemainingUnits(remainingTotalSeconds);
  const isCompleted = remainingTotalSeconds <= 0;

  return (
    <Wrapper>
      <Title>{title}</Title>
      {isCompleted ? (
        <CompletedState>
          <CompletedBadge>{completedLabel}</CompletedBadge>
          <CompletedDate>{formatMilestoneDate(dateString)}</CompletedDate>
        </CompletedState>
      ) : (
        <ContentWrapper>
          <ContentRow>
            <Item>
              <span>{remaining.days}</span>
              <p>DAGER</p>
            </Item>
            <Item>
              <span>{remaining.hours}</span>
              <p>TIMER</p>
            </Item>
          </ContentRow>
          <ContentRow>
            <Item>
              <span>{remaining.minutes}</span>
              <p>MINUTTER</p>
            </Item>
            <Item>
              <span>{remaining.seconds}</span>
              <p>SEKUNDER</p>
            </Item>
          </ContentRow>
        </ContentWrapper>
      )}
    </Wrapper>
  );
};

export default CountDown;

const getRemainingSeconds = (dateString: string) =>
  Math.round((new Date(dateString).valueOf() - new Date().valueOf()) / 1000);

const calculateRemainingUnits = (remainingSeconds: number) => {
  let remaining = Math.max(remainingSeconds, 0);
  const seconds = remaining % 60;
  remaining = (remaining - seconds) / 60;
  const minutes = remaining % 60;
  remaining = (remaining - minutes) / 60;
  const hours = remaining % 24;
  remaining = (remaining - hours) / 24;
  const days = remaining;
  return { days, hours, minutes, seconds };
};

const formatMilestoneDate = (dateString: string) =>
  new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));

/** Styles **/

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem 0.5rem;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid #eceff3;
  min-width: 0;
  flex: 1 1 220px;

  ${media.handheld`
    width: 100%;
  `}
`;

const Title = styled.h3`
  font-size: 1rem;
  font-weight: 700;
  text-align: center;
  margin: 0;
  margin-bottom: 1rem;
  color: #374151;

  ${media.handheld`
    font-size: 1rem;
  `}
`;

const ContentWrapper = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;
`;

const ContentRow = styled.div`
  display: flex;
`;

const Item = styled.div`
  margin: 0 15px;
  margin-bottom: 1em;
  text-align: center;
  width: 70px;
  line-height: 1.2;

  span {
    font-size: 2rem;
    font-weight: 800;
    color: #111827;
  }

  p {
    margin: 0;
    font-size: 0.625rem;
    font-weight: 700;
    color: #9ca3af;
    letter-spacing: 0.05em;
  }

  ${media.handheld`
    margin: 0 0.5rem;
    width: 60px;

    span {
      font-size: 1.5rem;
    }
  `}
`;

const CompletedState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 138px;
  text-align: center;
`;

const CompletedBadge = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  background: rgba(178, 18, 7, 0.08);
  border: 1px solid rgba(178, 18, 7, 0.14);
  color: #b21207;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const CompletedDate = styled.p`
  margin: 0;
  color: #6b7280;
  font-size: 0.875rem;
  font-weight: 600;
`;
