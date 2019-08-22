import React from "react";
import styled from "styled-components";
import { NavLink } from "react-router-dom";
import DecorativeLine from "src/components/DecorativeLine";
import { withRouter } from "react-router-dom";

const NavItem = ({ to, text, match }) => {
  return (
    <Container>
      <Item to={to}>{text}</Item>
      <DecorativeLine red={match.url === to} />
    </Container>
  );
};

export default withRouter(NavItem);

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
