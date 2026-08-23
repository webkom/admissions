import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import avatar from "assets/avatar.png";
import djangoData from "src/utils/djangoData";
import { handleSensitiveLogoutLink } from "src/query/sensitiveActorSync";

const UserInfo: React.FC = () => {
  const queryClient = useQueryClient();

  return (
    <Container>
      <NameLogOutWrapper>
        <Name>{djangoData.user.full_name}</Name>
        <LogoutButton
          href="/logout/"
          onClick={(event) => handleSensitiveLogoutLink(queryClient, event)}
        >
          Logg ut
        </LogoutButton>
      </NameLogOutWrapper>
      <ProfilePicture src={djangoData.user.profile_picture || avatar} />
    </Container>
  );
};

export default UserInfo;

const Container = styled.div`
  border-radius: var(--border-radius-md);
  cursor: default;
  display: flex;
  align-items: center;
  margin: var(--spacing-md);
  margin-right: var(--spacing-7xl);

  ${media.portrait`        
    margin-right: var(--spacing-md);
    margin-left: var(--spacing-xl);
  `}

  ${media.handheld`        
    order: 2;
    display: inline;
    margin: 0;
    margin-bottom: var(--spacing-md);
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
    margin-bottom: var(--spacing-sm);
    line-height: var(--line-height-nano);
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
  line-height: var(--line-height-tiny);
  padding: var(--spacing-xs) var(--spacing-md);
  color: var(--lego-font-color);
  &:hover {
    color: var(--lego-red-color);
  }
`;

const ProfilePicture = styled.img`
  object-fit: scale-down;
  height: auto;
  width: var(--avatar-size-md);
  height: var(--avatar-size-md);
  border-radius: var(--border-radius-pill);
  margin-left: var(--spacing-md);

  ${media.portrait`        
    width: var(--avatar-size-sm);
    margin-left: var(--spacing-sm);
  `}

  ${media.handheld`        
    display: none;
  `}
`;
