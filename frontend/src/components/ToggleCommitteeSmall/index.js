/**
 *
 * A small toggle (add/remove) for the small committee toggle on the
 * application form page.
 *
 */

import React from "react";

import IconWrapper from "./IconWrapper";
import Logo from "./Logo";
import Wrapper from "./Wrapper";
import Name from "./Name";

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
