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
  const isRevy = admissionSlug?.includes("revy");
  const isRevyBoard = admissionSlug === "revystyret";
  const isSingleGroupAdmission = admission?.groups.length === 1;

  return (
    <Container>
      <Inner>
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
      </Inner>
    </Container>
  );
};

export default NavBar;

const Container = styled.nav`
  background: var(--color-surface-base);
  width: 100%;
  height: var(--navigation-height);
  border-bottom: var(--border-width-default) solid var(--color-border-soft);
  box-shadow: var(--shadow-sm);
  position: sticky;
  top: 0;
  z-index: var(--navigation-layer);
  backdrop-filter: saturate(140%) blur(var(--motion-distance-sm));

  ${media.handheld`
    height: auto;
    position: relative;
  `}
`;

const Inner = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: var(--content-width-page);
  height: 100%;
  margin: 0 auto;
  padding: 0 var(--page-gutter);

  ${media.handheld`
    flex-direction: column;
    height: auto;
    padding: var(--spacing-md);
  `}
`;

const BrandContainer = styled.div`
  width: var(--navigation-logo-width);
  flex-shrink: 0;
  transition: var(--transition-base);

  &:hover {
    transform: scale(1.05);
  }

  ${media.handheld`        
    margin-bottom: var(--spacing-md);
    order: 1;
  `};
`;

const NavItemsContainer = styled.ul`
  display: flex;
  gap: var(--spacing-6xl);

  ${media.portrait`  
    gap: var(--spacing-lg);
  `}

  ${media.handheld`
    order: 3;
    width: 100%;
    justify-content: center;
    margin-top: var(--spacing-md);
    padding-top: var(--spacing-xl);
    border-top: var(--border-width-default) solid var(--color-border-soft);
  `}
`;
