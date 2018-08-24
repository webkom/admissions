/**
 *
 * IconWrapper for the small committee toggle.
 *
 */

import styled from "styled-components";

const IconWrapper = styled.div`
  width: 2.5em;
  height: 2.5em;
  position: relative;

  filter: ${props => (props.isChosen ? "none" : "grayscale()")};

  &:hover {
    filter: none;
    opacity: 0.5;
  }
  &:hover > img {
    opacity: 0.5;
  }

  &:active {
    opacity: 1;
  }
`;

export default IconWrapper;
