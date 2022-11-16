import styled from "styled-components";

interface HeaderProps {
  textTransform: string;
}

const Header = styled.h2<HeaderProps>`
  font-size: 1.2em;
  font-family: var(--font-family);
  display: block;
  margin: 0;
  width: 100%;
  text-transform: ${(props) => props.textTransform};
`;

export default Header;
