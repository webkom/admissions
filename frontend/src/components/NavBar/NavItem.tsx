import React from "react";
import styled from "styled-components";
import { NavLink, useMatch } from "react-router-dom";

interface NavItemProps {
  to: string;
  text: string;
}

const NavItem: React.FC<NavItemProps> = ({ to, text }) => {
  const match = useMatch(to + "/*");
  return (
    <Container $active={!!match}>
      <Item to={to}>{text}</Item>
    </Container>
  );
};

export default NavItem;

/** Styles **/

const Item = styled(NavLink)`
  color: var(--color-text-accent);
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-ui);
  letter-spacing: var(--letter-spacing-ui-tight);
  transition: var(--transition-base);

  &:hover {
    color: var(--color-brand);
  }
`;

const Container = styled.li<{ $active: boolean }>`
  position: relative;
  padding: var(--spacing-sm) 0;

  &::after {
    content: "";
    position: absolute;
    bottom: calc(-1 * var(--border-width-default));
    left: 0;
    width: 100%;
    height: var(--underline-thickness);
    background-color: var(--color-brand);
    transform: ${(props) => (props.$active ? "scaleX(1)" : "scaleX(0)")};
    transform-origin: left;
    transition: var(--transition-base);
  }

  &:hover::after {
    transform: scaleX(1);
    background-color: var(--color-border-muted);
    ${(props) => props.$active && `background-color: var(--color-brand);`}
  }
`;
