import React from "react";
import styled from "styled-components";

// See https://ionicons.com/ for icon names. md or ios as prefix.

interface IconProps extends IconStyleProps {
  name: string;
  title?: string;
  prefix?: string;
}

const Icon: React.FC<IconProps> = ({
  name,
  title,
  size,
  color,
  padding,
  prefix = "md",
}) => (
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

interface IconStyleProps {
  size?: string | number;
  color?: string;
  padding?: string | number;
}

const Ionicon = styled.i.attrs((props: IconStyleProps) => ({
  size: props.size || "2rem",
  color: props.color || "inherit",
  padding: props.padding || "0",
}))`
  font-size: ${(props) => props.size};
  line-height: 1;
  color: ${(props) => props.color};
  padding: ${(props) => props.padding};
`;
