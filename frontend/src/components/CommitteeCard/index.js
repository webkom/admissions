import React from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import Button from "src/components/Button";

const UnstyledLogo = ({ className, logo }) => (
  <img className={className} src={logo} alt="Logo" />
);

const Card = styled.div`
  background: white;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
  height: 640px;
  max-width: 21rem;
  margin: 1em;
  padding: 2em 1em;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.09);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  ${media.handheld`
    height: 100%;
    flex: 1 1 100%;
    `};
`;

const CommitteeCardTitle = styled.h2`
  margin: 0;
`;

const CommitteeCardText = styled.p`
  padding: 0 1em;
  flex: 1;
`;

const Logo = styled(UnstyledLogo)`
  object-fit: scale-down;
  width: 15em;
`;

const ChooseButton = styled(Button)`
  background: ${props => (props.isChosen ? "#db3737" : "gray")};
`;

const LearnMoreLink = styled.a`
  font-weight: bold;
  margin: 1em;
`;

const CommitteeCard = props => {
  return (
    <Card className={props.className}>
      <Logo
        logo={require(`assets/committee_logos/${props.name.toLowerCase()}.png`)}
      />
      <CommitteeCardTitle>{props.name}</CommitteeCardTitle>
      <CommitteeCardText>{props.description}</CommitteeCardText>
      <LearnMoreLink href={`${props.readMoreLink}`} target="_blank">
        Les mer
      </LearnMoreLink>
      <ChooseButton
        onClick={() => props.onToggle(props.name)}
        isChosen={props.isChosen}
        width={"11em"}
      >
        Velg {props.name}
      </ChooseButton>
    </Card>
  );
};

export default CommitteeCard;
