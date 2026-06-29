import React from "react";
import styled from "styled-components";
import { useParams } from "react-router-dom";
import { useAdmission } from "src/query/hooks";
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
  const { admissionSlug, groupId } = useParams();

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
    const group = (groups ?? []).find((group) => group.pk === groupId);
    if (!group) return <div>Feil: Ugyldig gruppe</div>;

    return (
      <PageWrapper>
        <HeaderCard>
          <GroupLogoWrapper>
            <GroupLogo src={group.logo} />
            <div>
              <SectionEyebrow>Gruppeinnstillinger</SectionEyebrow>
              <GroupTitle>{group.name}</GroupTitle>
              <GroupDescription>
                Juster beskrivelsen og autosvaret som vises for søkerne i denne
                gruppen.
              </GroupDescription>
            </div>
          </GroupLogoWrapper>
        </HeaderCard>

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
  gap: 1rem;
  width: 100%;
`;

const HeaderCard = styled.div`
  width: 100%;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e5e7eb;
`;

const SectionEyebrow = styled.span`
  display: inline-block;
  margin-bottom: 0.35rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #6b7280;
`;

const GroupTitle = styled.h1`
  margin: 0;
  font-size: 1.65rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #1f2937;
`;

const GroupDescription = styled.p`
  margin: 0.45rem 0 0;
  color: #6b7280;
  line-height: 1.6;
`;
