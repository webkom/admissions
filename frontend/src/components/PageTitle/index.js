import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const PageTitle = styled.h1`
  ${media.handheld`
    margin: 0 1em 0 1em;
    font-size: 2.5rem;
  `};
`;

export default PageTitle;
