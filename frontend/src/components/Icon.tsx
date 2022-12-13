import React from "react";
import styled, { Interpolation } from "styled-components";

// See https://ionicons.com/ for icon names. md or ios as prefix.

interface IconProps extends IconStyleProps {
  name: string;
  title?: string;
  prefix?: string;
  styles?: Interpolation<React.CSSProperties>;
}

const Icon: React.FC<IconProps> = ({
  name,
  title,
  size,
  color,
  padding,
  prefix = "md",
  styles,
}) => (
  <Ionicon
    className={`ion-${prefix}-${name}`}
    size={size}
    color={color}
    title={title}
    padding={padding}
    styles={styles}
  />
);

export default Icon;

/** Styles **/

interface IconStyleProps {
  size?: string | number;
  color?: string;
  padding?: string | number;
  styles?: Interpolation<React.CSSProperties>;
}

const Ionicon = styled.i.attrs((props: IconStyleProps) => ({
  size: props.size || "2rem",
  color: props.color || "inherit",
  padding: props.padding || "0",
  styles: props.styles,
}))`
  ${({ styles }) => styles}
  font-size: ${(props) => props.size};
  line-height: 1;
  color: ${(props) => props.color};
  padding: ${(props) => props.padding};
`;
