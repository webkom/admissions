import React from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import avatar from "assets/avatar.png";
import djangoData from "src/utils/djangoData";

const UserInfo: React.FC = () => {
  return (
    <Container>
      <NameLogOutWrapper>
        <Name>{djangoData.user.full_name}</Name>
        <LogoutButton href="/logout/">Logg ut</LogoutButton>
      </NameLogOutWrapper>
      <ProfilePicture src={djangoData.user.profile_picture || avatar} />
    </Container>
  );
};

export default UserInfo;

/** Styles **/

const Container = styled.div`
  border-radius: var(--border-radius-md);
  cursor: default;
  display: flex;
  align-items: center;
  margin: 10px;
  margin-right: 5rem;

  ${media.portrait`        
    margin-right: var(--spacing-md);
    margin-left: var(--spacing-xl);
  `}

  ${media.handheld`        
    order: 2;
    display: inline;
    margin: 0;
    margin-bottom: 10px;
  `}
`;

const NameLogOutWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;

  ${media.handheld`        
    order: 2;
    display: inline-flex;
    flex-direction: row;
    align-items: center;
  `}
`;

const Name = styled.span`
  ${media.portrait`        
    font-size: var(--font-size-detail);
    margin-bottom: 5px;
    line-height: 0.8rem;
  `}

  ${media.handheld`        
    margin-right: var(--spacing-md);
    margin-bottom: 0;
    font-size: var(--font-size-detail);
  `}
`;

const LogoutButton = styled.a`
  background: var(--color-gray-3);
  border-radius: var(--border-radius-sm);
  display: inline;
  font-size: var(--font-size-xs);
  line-height: 1rem;
  padding: 0.12rem 0.5rem;
  color: var(--lego-font-color);
  &:hover {
    color: var(--lego-red-color);
  }
`;

const ProfilePicture = styled.img`
  object-fit: scale-down;
  height: auto;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  margin-left: var(--spacing-md);

  ${media.portrait`        
    width: 40px;
    margin-left: var(--spacing-sm);
  `}

  ${media.handheld`        
    display: none;
  `}
`;
