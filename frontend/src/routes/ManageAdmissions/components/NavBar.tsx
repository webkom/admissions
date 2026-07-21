import React from "react";
import { NavLink } from "react-router-dom";
import { Admission } from "src/types";
import styled from "styled-components";

interface Props {
  admissions?: Admission[];
}

const NavBar: React.FC<Props> = ({ admissions }) => (
  <Navigation aria-label="Opptak som kan administreres">
    <NavHeader>Opptak</NavHeader>
    <NavigationList>
      {admissions?.map((admission) => (
        <li key={admission.pk}>
          <AdmissionLink to={`/manage/${admission.slug}`}>
            {admission.title}
          </AdmissionLink>
        </li>
      ))}
    </NavigationList>
    {admissions?.length === 0 && (
      <EmptyText>Du har ikke opprettet noen opptak ennå.</EmptyText>
    )}
  </Navigation>
);

export default NavBar;

const Navigation = styled.nav`
  padding: 0 var(--spacing-xl);
`;

const NavHeader = styled.h2`
  margin: 0 0 var(--spacing-md);
  font-size: var(--font-size-md);
`;

const NavigationList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  margin: 0;
  padding: 0;
  list-style: none;
`;

const AdmissionLink = styled(NavLink)`
  display: block;
  padding: var(--spacing-sm) var(--spacing-md);
  border-left: var(--border-width-emphasis) solid transparent;
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-weight: 500;
  text-decoration: none;

  &:hover {
    background: var(--color-surface-subtle);
  }

  &.active {
    border-left-color: var(--color-brand);
    background: var(--color-brand-soft);
    color: var(--color-brand);
    font-weight: 600;
  }
`;

const EmptyText = styled.p`
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
`;
