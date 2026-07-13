import React, { useMemo } from "react";
import { Link, NavLink as RouterNavLink } from "react-router-dom";
import { Admission } from "src/types";
import styled from "styled-components";
import { ArrowLeft } from "lucide-react";

interface Props {
  admission?: Admission;
}

const NavBar: React.FC<Props> = ({ admission }) => {
  const administrateGroups = useMemo(
    () =>
      admission?.groups.filter(
        (group) =>
          admission?.userdata.is_admin ||
          admission?.userdata.committee_groups.includes(group.name),
      ),
    [admission],
  );

  return (
    <Wrapper>
      <BackLink to={"/"}>
        <ArrowLeft size={20} aria-hidden="true" /> Til forsiden
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
  gap: 0.75rem;
`;

const PanelSection = styled.section`
  padding: var(--spacing-md);
  border: 1.5px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  background: var(--color-surface-base);
  box-shadow: var(--shadow-sm);
`;

const SectionEyebrow = styled.span`
  display: inline-block;
  margin-bottom: 0.4rem;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-text-muted);
`;

const NavHeader = styled.h3`
  margin: 0;
  font-size: var(--font-size-ui);
  font-weight: 600;
  color: var(--color-text-primary);
`;

const NavDescription = styled.p`
  display: none;
`;

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  width: fit-content;
  padding: 0.55rem 0.75rem;
  border: 1.5px solid var(--color-border-soft);
  border-radius: 999px;
  background: var(--color-surface-base);
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
  font-weight: 600;
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
  height: 2.25rem;
  padding: 0 0.65rem;
  border-radius: var(--border-radius-md);
  margin-top: 0.3rem;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-weight: 600;
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
  margin: 0.4rem 0 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-detail);
  line-height: 1.3;
`;
