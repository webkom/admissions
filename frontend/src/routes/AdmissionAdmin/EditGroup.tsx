import React from "react";
import styled from "styled-components";
import { useParams } from "react-router-dom";
import { useAdmission } from "src/query/hooks";
import djangoData from "src/utils/djangoData";
import LoadingBall from "src/components/LoadingBall";
import EditGroupForm from "./components/EditGroupForm";
import { Wrapper, GroupLogo, GroupLogoWrapper } from "./components/styles";

export interface CsvData {
  name: string;
  email: string;
  username: string;
  applicationText: string;
  createdAt: string;
  updatedAt: string;
  appliedWithinDeadline: boolean;
  phoneNumber: string;
}

const EditGroup = () => {
  const { admissionSlug } = useParams();

  const {
    data: admission,
    isFetching,
    error,
  } = useAdmission(admissionSlug ?? "");
  const { groups } = admission ?? {};

  if (error) {
    return <div>Error: {error.message}</div>;
  } else if (isFetching) {
    return <LoadingBall />;
  } else if (!groups) {
    return <div>Feil: klarte ikke laste inn grupper.</div>;
  } else {
    const group = (groups ?? []).find(
      (group) => group.name === djangoData.user.representative_of_group,
    );
    if (!group) return <div>Feil: Ugyldig gruppe</div>;

    return (
      <PageWrapper>
        <GroupLogoWrapper>
          <GroupLogo src={group.logo} />
          <h2>{djangoData.user.representative_of_group}</h2>
        </GroupLogoWrapper>

        <Wrapper>
          <EditGroupForm
            initialDescription={group && group.description}
            initialReplyText={group && group.response_label}
            group={group}
          />
        </Wrapper>
      </PageWrapper>
    );
  }
};

export default EditGroup;

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
`;
