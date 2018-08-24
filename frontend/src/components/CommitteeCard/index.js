import React from "react";
import { Card, Title, Text, Logo, LearnMore, Mark } from "./styles";
import "./style.css";

const CommitteeCard = props => {
  return (
    <Card onClick={() => props.onToggle(props.name)} isChosen={props.isChosen}>
      {props.isChosen && (
        <div className="ribbon">
          <span>Valgt</span>
        </div>
      )}
      <Logo
        src={require(`assets/committee_logos/${props.name.toLowerCase()}.png`)}
      />
      <Title>{props.name}</Title>
      <Text>{props.description}</Text>
      <LearnMore href={`${props.readMoreLink}`} target="_blank">
        Les mer
      </LearnMore>
      <Mark isChosen={props.isChosen} />
    </Card>
  );
};

export default CommitteeCard;
