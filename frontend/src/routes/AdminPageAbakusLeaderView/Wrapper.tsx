import styled from "styled-components";
import { Card } from "src/components/Card";
import { media } from "src/styles/mediaQueries";

const Wrapper = styled(Card)`
  width: 80%;
  max-width: 100%;
  min-height: 30em;
  padding: 0;

  ${media.handheld`
    width: auto;
    padding: 0 10px;
  `};
`;

export default Wrapper;

export const TableWrapper = styled.div`
  max-width: 100%;
  overflow-x: auto;
`;
