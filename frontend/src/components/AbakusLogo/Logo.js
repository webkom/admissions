import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const Logo = styled.img.attrs({
  size: props => props.size || "8em"
})`
  display: block;
  padding: 1.5em;
  object-fit: scale-down;
  max-height: ${props => props.size};

  ${media.handheld`
    max-height: 6em;
    `};
`;

export default Logo;
