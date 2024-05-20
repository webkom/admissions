import React, { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import Icon from "src/components/Icon";
import { useAdmission } from "src/query/hooks";
import djangoData from "src/utils/djangoData";
import styled from "styled-components";

const NavBar: React.FC = () => {
  const { admissionSlug } = useParams();
  const { data: admission } = useAdmission(admissionSlug ?? "");

  const representingGroup = useMemo(
    () =>
      admission?.groups.find(
        (group) => group.name === djangoData.user.representative_of_group,
      ),
    [admission],
  );

  if (!admission) return null;

  const { userdata, slug } = admission;

  return (
    <Wrapper>
      <Link to={"/"}>
        <Icon name="arrow-back" size={22} /> Gå tilbake til forsiden
      </Link>

      <NavHeader>Administrer opptak</NavHeader>
      {userdata.is_admin && (
        <NavLink to={`/${slug}/admin/edit`}>Rediger opptak</NavLink>
      )}
      <NavLink to={`/${slug}/admin/`}>Se søknader</NavLink>
      <NavHeader>Administrer grupper</NavHeader>
      {representingGroup ? (
        <NavLink to={"./groups/" + representingGroup.pk}>
          {representingGroup.name}
        </NavLink>
      ) : (
        <p>
          Du har ikke tilgang til å redigere noen av gruppene i dette opptaket.
        </p>
      )}
    </Wrapper>
  );
};

export default NavBar;

const Wrapper = styled.div`
  padding: 1rem;

  h2,
  h3 {
    margin-bottom: 0.3em;
    margin-top: 0.7em;
  }

  p {
    margin: 0;
  }
`;

const NavHeader = styled.h3`
  display: block;
  margin: 0;
  line-height: 1.4;
`;

const NavLink = styled(Link)`
  display: block;
  line-height: 1.4;
  padding: 0.3rem 0;
  font-weight: 500;
`;
