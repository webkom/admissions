import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 1em 0;

  ${media.handheld`
     justify-content: center;
     flex-wrap: wrap;
  `};
`;

export default Header;
