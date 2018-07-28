/**
 *
 * A small toggle (add/remove) for the small committee toggle on the
 * application form page.
 *
 */

import React from "react";

import Icon from "./Icon";
import Logo from "./Logo";
import Wrapper from "./Wrapper";
import Name from "./Name";

const ToggleCommitteeSmall = ({ name, toggleCommittee, isChosen }) => {
  return (
    <Wrapper>
      <button onClick={() => toggleCommittee(name.toLowerCase())}>
        {isChosen ? (
          <Icon color="#b11c11" icon="remove_circle" />
        ) : (
          <Icon icon="add_circle" />
        )}
      </button>{" "}
      <Logo
        logo={require(`assets/committee_logos/${name.toLowerCase()}.png`)}
      />{" "}
      <Name>{name}</Name>
    </Wrapper>
  );
};
export default ToggleCommitteeSmall;
