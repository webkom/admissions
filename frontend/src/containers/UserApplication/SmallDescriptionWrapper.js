import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const SmallDescriptionWrapper = styled.div`
  display: inline-flex;
  flex-direction: column;
  margin: 0 2em;
  justify-content: flex-start;
  line-height: 1;

  ${media.handheld`
       margin: 0.5em 0;
       flex: 1 1 50%;
       align-items: center;
    `};
`;

export default SmallDescriptionWrapper;
