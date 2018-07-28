import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const ChooseCommittesContainer = styled.div`
  grid-area: committees;
  position: fixed;
  top: 11em;
  left: 90%;
  transform: translateX(-90%);
  ${media.handheld`
    `};
`;

export default ChooseCommittesContainer;
