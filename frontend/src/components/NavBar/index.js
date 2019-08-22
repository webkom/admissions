import React from "react";
import styled from "styled-components";
import UserInfo from "./UserInfo";
import AbakusLogo from "src/components/AbakusLogo";
import NavItem from "./NavItem";
import { media } from "src/styles/mediaQueries";

const NavBar = ({ user, isEditing }) => (
  <Container>
    <BrandContainer>
      <AbakusLogo />
    </BrandContainer>
    <NavItemsContainer>
      {(!user.has_application || isEditing) && (
        <NavItem to="/committees" text="Velg komiteer" />
      )}
      <NavItem to="/application" text="Min søknad" />
    </NavItemsContainer>

    <UserInfo user={user} />
  </Container>
);

export default NavBar;

/** Styles **/

const Container = styled.nav`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--lego-gray-lightest);
  width: 100%;
  height: 70px;
  border-bottom: 3px solid rgba(192, 57, 43, 0.08);

  ${media.handheld`        
    flex-direction: column;
    height: auto;
  `}
`;

const BrandContainer = styled.div`
  width: 125px;
  margin: 0 2rem;

  ${media.handheld`        
    margin: 1rem 0 5px 0;
    order: 1;
  `}
`;

const NavItemsContainer = styled.ul`
  display: flex;
  ${media.handheld`        
    order: 3;
    margin-bottom: 1rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--lego-gray-medium);

  `}
`;
