import React, { useMemo } from "react";
import { Link, NavLink as RouterNavLink } from "react-router-dom";
import { Admission } from "src/types";
import styled from "styled-components";
import { ArrowLeft } from "lucide-react";
import { iconSizes } from "src/styles/designTokens";

interface Props {
  admission?: Admission;
}

const NavBar: React.FC<Props> = ({ admission }) => {
  const administrateGroups = useMemo(
    () =>
      admission?.groups.filter(
        (group) =>
          admission?.userdata.is_admin ||
          admission?.userdata.represented_groups.includes(group.name),
      ),
    [admission],
  );

  return (
    <Wrapper>
      <BackLink to={"/"}>
        <ArrowLeft size={iconSizes.feature} aria-hidden="true" /> Til forsiden
      </BackLink>

      <PanelSection>
        <SectionEyebrow>Opptaksadmin</SectionEyebrow>
        <NavHeader>{admission?.title ?? "Administrer opptak"}</NavHeader>
        <NavDescription>
          Bytt mellom søknadsoversikten og gruppeinnstillingene uten å lete i
          flere paneler.
        </NavDescription>
        <NavLink to={"../admin/"} end>
          Se søknader
        </NavLink>
      </PanelSection>

      <PanelSection>
        <SectionEyebrow>Grupper</SectionEyebrow>
        {administrateGroups?.length !== 0 ? (
          administrateGroups?.map((administrateGroup) => (
            <NavLink
              key={administrateGroup.pk}
              to={"./groups/" + administrateGroup.pk}
            >
              {administrateGroup.name}
            </NavLink>
          ))
        ) : (
          <NavEmptyState>
            Du har ikke tilgang til å redigere noen av gruppene i dette
            opptaket.
          </NavEmptyState>
        )}
      </PanelSection>
    </Wrapper>
  );
};

export default NavBar;

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
`;

const PanelSection = styled.section`
  padding: var(--spacing-md);
  border: var(--border-width-emphasis) solid var(--color-border);
  border-radius: var(--border-radius-lg);
  background: var(--color-surface-base);
  box-shadow: var(--shadow-sm);
`;

const SectionEyebrow = styled.span`
  display: inline-block;
  margin-bottom: var(--spacing-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-muted);
`;

const NavHeader = styled.h3`
  margin: 0;
  font-size: var(--font-size-ui);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
`;

const NavDescription = styled.p`
  display: none;
`;

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-md);
  width: fit-content;
  padding: var(--spacing-md) var(--spacing-lg);
  border: var(--border-width-emphasis) solid var(--color-border-soft);
  border-radius: var(--border-radius-pill);
  background: var(--color-surface-base);
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
  font-weight: var(--font-weight-semibold);
  text-decoration: none;
  transition: color var(--easing-fast);

  &:hover {
    border-color: var(--color-brand-strong-border);
    color: var(--color-brand);
  }
`;

const NavLink = styled(RouterNavLink)`
  display: flex;
  align-items: center;
  height: var(--control-height-sm);
  padding: 0 var(--spacing-lg);
  border-radius: var(--border-radius-md);
  margin-top: var(--spacing-sm);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-decoration: none;
  transition:
    background var(--easing-fast),
    color var(--easing-fast);

  &:hover {
    background: var(--color-surface-subtle);
    color: var(--color-text-primary);
  }

  &.active {
    background: var(--color-brand);
    color: var(--color-absolute-white);
  }
`;

const NavEmptyState = styled.p`
  margin: var(--spacing-md) 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
  line-height: var(--line-height-base);
`;
