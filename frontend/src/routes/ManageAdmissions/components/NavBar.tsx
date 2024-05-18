import React from "react";
import { Link } from "react-router-dom";
import LinkButton from "src/components/LinkButton";
import { Admission } from "src/types";
import styled from "styled-components";

interface Props {
  admissions?: Admission[];
}

const NavBar: React.FC<Props> = ({ admissions }) => {
  return (
    <Wrapper>
      <NavHeader>Opptak</NavHeader>
      {admissions?.map((admission) => (
        <NavLink
          key={admission.pk + admission.title}
          to={"/manage/" + admission.slug}
        >
          {admission.title}
        </NavLink>
      ))}
      {admissions?.length === 0 && (
        <p>Du har ikke redigeringstilgang til noen opptak.</p>
      )}
      <CreateNewWrapper>
        <LinkButton to="/manage/create" dark size="small">
          Lag nytt
        </LinkButton>
      </CreateNewWrapper>
    </Wrapper>
  );
};

export default NavBar;

const Wrapper = styled.div`
  padding: 0 1rem;
`;

const NavHeader = styled.h3`
  margin: 0;
`;

const NavLink = styled(Link)`
  display: block;
  line-height: 1.4;
  padding: 0.3rem 0;
  font-weight: 500;
`;

const CreateNewWrapper = styled.div`
  margin-top: 1rem;
`;
