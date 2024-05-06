import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

interface CountDownProps {
  title: string;
  dateString: string;
}

const CountDown: React.FC<CountDownProps> = ({ title, dateString }) => {
  const [remainingTotalSeconds, setRemainingTotalSeconds] = useState(
    getRemainingSeconds(dateString),
  );
  const [remaining, setRemaining] = useState(
    calculateRemainingUnits(remainingTotalSeconds),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingTotalSeconds(
        (prevRemainingTotalSeconds) => prevRemainingTotalSeconds - 1,
      );
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setRemaining(calculateRemainingUnits(remainingTotalSeconds));
  }, [remainingTotalSeconds]);

  return (
    <Wrapper>
      <Title>{title}</Title>
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
    </Wrapper>
  );
};

export default CountDown;

const getRemainingSeconds = (dateString: string) =>
  Math.round((new Date(dateString).valueOf() - new Date().valueOf()) / 1000);

const calculateRemainingUnits = (remainingSeconds: number) => {
  let remaining = remainingSeconds;
  const seconds = Math.round(remaining % 60);
  remaining = (remaining - seconds) / 60;
  const minutes = Math.round(remaining % 60);
  remaining = (remaining - minutes) / 60;
  const hours = Math.round(remaining % 24);
  remaining = (remaining - hours) / 24;
  const days = Math.round(remaining);
  return { days, hours, minutes, seconds };
};

/** Styles **/

const Wrapper = styled.div`
  display: flex;
  background-color: #fff;
  padding: 0.5em;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  ${media.handheld`
    margin-top: 0.4em;
    margin-bottom: 1em;
  `}
`;

const Title = styled.h3`
  font-size: 23px;
  text-align: center;
  margin: 0;
  margin-bottom: 10px;
  flex-basis: 100%;

  ${media.handheld`
    font-size: 1.3rem;
  `}
`;

const ContentWrapper = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  margin-bottom: 0.5em;
`;

const ContentRow = styled.div`
  display: flex;
`;

const Item = styled.div`
  margin: 0 20px;
  margin-bottom: 1em;
  text-align: center;
  width: 80px;
  line-height: 1.4;

  span {
    font-size: 1.8rem;
    font-weight: 700;
  }

  p {
    margin: 0;
    font-size: 0.85rem;
  }

  ${media.handheld`
    margin: 0 0.2em;
  `}
`;
