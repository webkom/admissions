import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const PageSubTitle = styled.h2`
  font-size: 2rem;
  margin: 0.6em 0;
  line-height: 1.2em;
  color: gray;
  font-size: 2rem;
  ${media.handheld`
    text-align: center;
    margin: 0.3em;
    font-size: 1.5rem;
    `};
`;

export default PageSubTitle;
