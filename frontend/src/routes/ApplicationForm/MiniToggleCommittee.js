/**
 *
 * A small toggle (add/remove) for the small committee toggle on the
 * application form page.
 *
 */

import React from "react";
import styled from "styled-components";

const MiniToggleCommittee = ({ name, logo, toggleCommittee, isChosen }) => {
  return (
    <Wrapper
      type="button"
      onClick={() => toggleCommittee(name.toLowerCase())}
      isChosen={isChosen}
    >
      <Logo src={logo} />
    </Wrapper>
  );
};

export default MiniToggleCommittee;

/** Styles **/

const Wrapper = styled.button`
  padding: 0;
  width: 40px;
  font-family: var(--font-family);
  opacity: ${(props) => (props.isChosen ? "1" : "0.2")};
`;

const Logo = styled.img`
  object-fit: scale-down;
  width: 100%;
`;
