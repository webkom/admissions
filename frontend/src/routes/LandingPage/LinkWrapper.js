import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const LinkWrapper = styled.div`
  display: flex;

  > a {
    margin: 0 0.7em;
    width: 13em;

    ${media.handheld`
      margin: 1em;
      `};
  }

  ${media.handheld`
    flex-direction: column;
    `};
`;

export default LinkWrapper;
