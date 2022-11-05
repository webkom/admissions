import React from "react";
import styled from "styled-components";
import { NavLink, useMatch } from "react-router-dom";
import DecorativeLine from "src/components/DecorativeLine";

interface NavItemProps {
  to: string;
  text: string;
}

const NavItem: React.FC<NavItemProps> = ({ to, text }) => {
  const match = useMatch(to + "/*");
  return (
    <Container>
      <Item to={to}>{text}</Item>
      <DecorativeLine red={!!match} />
    </Container>
  );
};

export default NavItem;

/** Styles **/

const Item = styled(NavLink)`
  font-weight: 600;
  color: var(--lego-font-color);
  white-space: nowrap;

  &:nth-child(2n) {
    margin-right: 2rem;
  }
`;

const Container = styled.li`
  &:nth-child(2n) {
    margin-left: 2rem;
  }
`;
