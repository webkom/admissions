import React from "react";
import { IconWrapper, Logo, Wrapper, Name } from "./styles";

const ToggleCommitteeSmall = ({ name, toggleCommittee, isChosen }) => {
  return (
    <Wrapper type="button" onClick={() => toggleCommittee(name.toLowerCase())}>
      <IconWrapper isChosen={isChosen}>
        <Logo
          src={require(`assets/committee_logos/${name.toLowerCase()}.png`)}
        />
      </IconWrapper>
      <Name>{name}</Name>
    </Wrapper>
  );
};

export default ToggleCommitteeSmall;
