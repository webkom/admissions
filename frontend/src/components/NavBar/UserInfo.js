import React from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const UserInfo = ({ user }) => {
  console.log(user);
  return (
    <Container>
      <NameLogOutWrapper>
        <Name>{user.full_name}</Name>
        <LogoutBtn href="/logout/">Logg ut</LogoutBtn>
      </NameLogOutWrapper>
      <ProfilePicture src={require("assets/avatar.png")} />
    </Container>
  );
};

export default UserInfo;

/** Styles **/

const Container = styled.div`
  border-radius: 10px;
  cursor: default;
  display: flex;
  align-items: center;
  margin: 10px;
  margin-right: 5rem;

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
  `}
`;

const Name = styled.span`
  font-weight: 600;
  ${media.handheld`        
    margin-right: 1rem;
    font-size: 0.8rem;
  `}
`;

const LogoutBtn = styled.a`
  background: rgba(57, 75, 89, 0.14);
  border-radius: 4px;
  display: inline;
  font-size: 0.7rem;
  line-height: 1rem;
  padding: 1px 10px 4px 10px;
  color: var(--lego-font-color);
  font-weight: 600;
`;

const ProfilePicture = styled.img`
  object-fit: scale-down;
  height: auto;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  margin-left: 1rem;

  ${media.handheld`        
    display: none;
  `}
`;
