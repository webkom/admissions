import React from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const CommitteeCard = ({
  onToggle,
  isChosen,
  name,
  description,
  readMoreLink
}) => {
  return (
    <Card onClick={() => onToggle(name)} isChosen={isChosen}>
      <Logo src={require(`assets/committee_logos/${name.toLowerCase()}.png`)} />
      <Name>{name}</Name>
      <Description>{description}</Description>
      <LearnMoreLink href={`${readMoreLink}`} target="_blank">
        Les mer på abakus.no
      </LearnMoreLink>
      <SelectedMark isChosen={isChosen}>
        {isChosen ? (
          <SelectedMarkText isChosen={isChosen}>
            Valgt <span>- klikk for å fjerne</span>
          </SelectedMarkText>
        ) : (
          <SelectedMarkText>Velg komité</SelectedMarkText>
        )}
      </SelectedMark>
    </Card>
  );
};

export default CommitteeCard;

/** Styles **/

export const Card = styled.div`
  display: grid;
  grid-template-columns: 1fr 3fr;
  grid-template-rows: 2rem 1fr 1.5rem;
  grid-template-areas:
    ". name"
    "logo text"
    ". readmore";
  grid-gap: 10px 20px;
  background: var(--lego-white);
  box-shadow: ${props =>
    props.isChosen
      ? "1px 3px 5px rgba(129, 129, 129, 0.5)"
      : "1px 3px 5px rgba(129, 129, 129, 0.3)"};
  box-sizing: border-box;
  padding: 1.5rem 1.5rem calc(1.5rem + 35px) 1rem;
  border-radius: 10px;
  overflow: hidden;
  position: relative;
  max-width: 460px;

  &:hover {
    cursor: pointer;
    box-shadow: 0 2px 5px rgba(129, 129, 129, 0.9);
  }

  ${media.handheld`
    grid-template-columns: 1.5fr 5fr;
    grid-template-rows: 2rem 3fr;
    grid-template-areas:
      "logo name"
      "text text"
      "readmore readmore";
    grid-gap: 10px 5px;
    padding: 1.7rem 1.5rem calc(1rem + 35px) 1.5rem;
  `};
`;

export const Name = styled.h2`
  grid-area: name;
  margin: 0;
  font-size: 1.5rem;
  line-height: 2rem;
  letter-spacing: 0.7px;

  ${media.handheld`
    font-size: 1.3rem;
    padding: 0
    text-align: left;
    align-self: center;
    `};
`;

export const Description = styled.p`
  grid-area: text;
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.3rem;

  ${media.handheld`
    padding: 0;
    text-align: left;
    margin-top: 10px;
    `};
`;

export const Logo = styled.img`
  object-fit: scale-down;
  grid-area: logo;
  width: 100%;
  ${media.handheld`
  width: 80%;
  align-self: center;
  `};
`;

export const LearnMoreLink = styled.a`
  grid-area: readmore;
  font-weight: 600;
  text-align: right;
  align-self: center;
  font-size: 0.9rem;

  &:hover {
    text-decoration: underline;
  }

  ${media.handheld`
    margin: 0;
    `};
`;

export const SelectedMark = styled.div`
  width: 100%;
  height: 35px;
  padding: 8px 0;
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: ${props =>
    props.isChosen
      ? "linear-gradient(180deg, #C0392B 0%, #BD1C1C 100%)"
      : "linear-gradient(180deg, #394B59 0%, #283642 100%)"};
  border-radius: 0px 0px 10px 10px;
`;

const SelectedMarkText = styled.span`
  color: ${props =>
    props.isChosen ? "var(--lego-white);" : "var(--lego-gray-light);"};
  font-size: 1rem;
  font-weight: bold;
  line-height: 1.2rrem;
  user-select: none;
  display: flex;
  align-items: center;

  span {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.8rem;
    margin-left: 4px;
  }

  ${media.handheld`
     font-size: 0.9rem;
     span {
      font-size: 0.7rem;
     }
  `};
`;
