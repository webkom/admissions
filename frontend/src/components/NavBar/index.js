import React from "react";
import styled from "styled-components";
import UserInfo from "./UserInfo";
import AbakusLogo from "src/components/AbakusLogo";
import NavItem from "./NavItem";

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
`;

const BrandContainer = styled.div`
  width: 125px;
  margin: 0 2rem;
`;

const NavItemsContainer = styled.ul`
  display: flex;
`;
