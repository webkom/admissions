import React from "react";
import { Link } from "react-router-dom";
import LegoButton from "src/components/LegoButton";
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
        <NavLink key={admission.pk} to={"/admin/" + admission.pk}>
          {admission.title}
        </NavLink>
      ))}
      <CreateNewWrapper>
        <LegoButton buttonStyle="primary" to="/admin/" icon="add" size="small">
          Lag nytt
        </LegoButton>
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
  display: inline-block;
  padding: 0.2rem 0;
  font-weight: 500;
  vertical-align: center;
`;

const CreateNewWrapper = styled.div`
  margin-top: 1rem;
`;
