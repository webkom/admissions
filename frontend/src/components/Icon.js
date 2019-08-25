import React from "react";
import styled from "styled-components";

// See https://ionicons.com/ for icon names. md or ios as prefix.

const Icon = ({ name, title, size, color, padding, prefix = "md" }) => (
  <Ionicon
    className={`ion-${prefix}-${name}`}
    size={size}
    color={color}
    title={title}
    padding={padding}
  />
);

export default Icon;

/** Styles **/

const Ionicon = styled.i.attrs(props => ({
  size: props.size || "2rem",
  color: props.color || "inherit",
  padding: props.padding || "0"
}))`
  font-size: ${props => props.size};
  line-height: 1;
  color: ${props => props.color};
  padding: ${props => props.padding};
`;
