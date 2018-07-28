/**
 *
 * Icon base for the icons used in the small committee toggle.
 *
 */

import styled from "styled-components";
import React from "react";

const UnstyledIcon = ({ className, icon }) => (
  <i className={`material-icons ${className}`}>{icon}</i>
);

const Icon = styled(UnstyledIcon).attrs({
  color: props => props.color || "gray"
})`
  color: ${props => props.color};
`;

export default Icon;
