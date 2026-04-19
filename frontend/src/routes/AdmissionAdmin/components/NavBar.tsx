import React, { useMemo } from "react";
import { Link, NavLink as RouterNavLink } from "react-router-dom";
import Icon from "src/components/Icon";
import { Admission } from "src/types";
import djangoData from "src/utils/djangoData";
import styled from "styled-components";

interface Props {
  admission?: Admission;
}

const NavBar: React.FC<Props> = ({ admission }) => {
  const administrateGroups = useMemo(
    () =>
      admission?.groups.filter(
        (group) =>
          admission?.userdata.is_admin ||
          group.name === djangoData.user.representative_of_group,
      ),
    [admission],
  );

  return (
    <Wrapper>
      <BackLink to={"/"}>
        <Icon name="arrow-back" size={20} /> Til forsiden
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
  gap: 1.25rem;
`;

const PanelSection = styled.section`
  padding-bottom: 1.25rem;
  border-bottom: 1px solid #e4e4e4;
`;

const SectionEyebrow = styled.span`
  display: inline-block;
  margin-bottom: 0.4rem;
  font-size: 0.688rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: #a0a0a0;
`;

const NavHeader = styled.h3`
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
  color: #111111;
  letter-spacing: -0.02em;
`;

const NavDescription = styled.p`
  display: none;
`;

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  width: fit-content;
  color: #a0a0a0;
  font-size: 0.813rem;
  font-weight: 600;
  text-decoration: none;
  transition: color 0.12s ease;

  &:hover {
    color: #111111;
  }
`;

const NavLink = styled(RouterNavLink)`
  display: flex;
  align-items: center;
  height: 2.25rem;
  padding: 0 0.65rem;
  border-radius: 8px;
  margin-top: 0.3rem;
  color: #4b4b4b;
  font-size: 0.875rem;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.12s ease, color 0.12s ease;

  &:hover {
    background: #f0f0f0;
    color: #111111;
  }

  &.active {
    background: rgba(178, 18, 7, 0.07);
    color: var(--lego-red-color);
  }
`;

const NavEmptyState = styled.p`
  margin: 0.4rem 0 0;
  color: #a0a0a0;
  font-size: 0.813rem;
  line-height: 1.6;
`;
