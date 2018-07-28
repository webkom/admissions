import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const ChooseCommittesContainerMobile = styled.div`
  ${media.handheld`
    display: flex;
    flex-wrap: wrap;
    `};
`;

export default ChooseCommittesContainerMobile;
