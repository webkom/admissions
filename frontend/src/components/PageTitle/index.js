import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const PageTitle = styled.h1`
  font-size: 3rem;
  margin: 0.2em 0 0 0;
  line-height: 1.2em;
  text-align: center;
  ${media.handheld`
    margin: 0 1em 0 1em;
    font-size: 2.5rem;
  `};
`;

export const MainPageTitle = styled.h1`
  font-size: 3rem;
  text-align: center;
  margin: 0.2em 0 0 0;
  line-height: 1.2em;
  ${media.handheld`
    font-size: 2.5rem;
  `};
`;

export default PageTitle;
