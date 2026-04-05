import React from "react";
import styled from "styled-components";
import UserInfo from "./UserInfo";
import AbakusLogo from "src/components/AbakusLogo";
import NavItem from "./NavItem";
import { media } from "src/styles/mediaQueries";
import { useParams } from "react-router-dom";
import { useAdmission } from "src/query/hooks";

interface NavBarProps {
  isEditing: boolean;
}

const NavBar: React.FC<NavBarProps> = ({ isEditing }) => {
  const { admissionSlug, ...params } = useParams();
  const { data: admission } = useAdmission(admissionSlug ?? "");
  const isRevy = admissionSlug === "revy";
  const isRevyBoard = admissionSlug === "revystyret";
  const isSingleGroupAdmission = admission?.groups.length === 1;

  return (
    <Container>
      <BrandContainer>
        <AbakusLogo />
      </BrandContainer>
      <NavItemsContainer>
        {params["*"]?.substring(0, 5) !== "admin" && (
          <>
            {!isSingleGroupAdmission &&
              (!admission?.userdata.has_application || isEditing) && (
                <NavItem
                  to={`/${admissionSlug}/velg-grupper`}
                  text={
                    isRevy
                      ? "Velg grupper"
                      : isRevyBoard
                        ? "Velg stillinger"
                        : "Velg komiteer"
                  }
                />
              )}
            <NavItem to={`/${admissionSlug}/min-soknad`} text="Min søknad" />
          </>
        )}
      </NavItemsContainer>
      <UserInfo />
    </Container>
  );
};

export default NavBar;

/** Styles **/

const Container = styled.nav`
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: white;
  width: 100%;
  height: 80px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  box-shadow: var(--shadow-sm);
  padding: 0 4rem;
  position: sticky;
  top: 0;
  z-index: 100;

  ${media.handheld`        
    flex-direction: column;
    height: auto;
    padding: 1rem;
    position: relative;
  `}
`;

const BrandContainer = styled.div`
  width: 140px;
  flex-shrink: 0;
  transition: var(--transition-base);

  &:hover {
    transform: scale(1.05);
  }

  ${media.handheld`        
    margin-bottom: 1rem;
    order: 1;
  `};
`;

const NavItemsContainer = styled.ul`
  display: flex;
  gap: 3rem;

  ${media.portrait`  
    gap: 1.5rem;
  `}

  ${media.handheld`        
    order: 3;
    width: 100%;
    justify-content: center;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #f3f4f6;
  `}
`;
