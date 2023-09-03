import React from "react";
import styled from "styled-components";
import UserInfo from "./UserInfo";
import AbakusLogo from "src/components/AbakusLogo";
import NavItem from "./NavItem";
import { media } from "src/styles/mediaQueries";
import { User } from "src/types";
import { useParams } from "react-router-dom";
import { useAdmission } from "src/query/hooks";

interface NavBarProps {
  user: User;
  isEditing: boolean;
}

const NavBar: React.FC<NavBarProps> = ({ user, isEditing }) => {
  const { admissionSlug } = useParams();
  const { data: admission } = useAdmission(admissionSlug ?? "");
  const isRevy = admissionSlug === "revy";

  return (
    <Container>
      <BrandContainer>
        <AbakusLogo />
      </BrandContainer>
      {!admission?.userdata.has_application || isEditing ? (
        <NavItemsContainer>
          <NavItem
            to={`/${admissionSlug}/velg-grupper`}
            text={isRevy ? "Velg grupper" : "Velg komiteer"}
          />
          <NavItem to={`/${admissionSlug}/min-soknad`} text="Min søknad" />
        </NavItemsContainer>
      ) : (
        <NavItemsContainer>
          <NavItem to={`/${admissionSlug}/min-soknad`} text="Min søknad" />
        </NavItemsContainer>
      )}

      <UserInfo user={user} />
    </Container>
  );
};

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
  flex-shrink: 0;
  ${media.handheld`        
    margin: 1rem 0 5px 0;
    order: 1;
  `};
`;

const NavItemsContainer = styled.ul`
  display: flex;
  margin-left: 7rem;

  ${media.portrait`  
    margin-left: 0;
  `}

  ${media.handheld`        
    order: 3;
    margin-bottom: 1rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--lego-gray-medium);
  `}
`;
