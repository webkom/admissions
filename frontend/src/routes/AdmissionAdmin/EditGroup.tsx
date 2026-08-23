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
    isLoading,
    error,
  } = useAdmission(admissionSlug ?? "");
  const { groups } = admission ?? {};

  if (error) {
    return <div>Error: {error.message}</div>;
  } else if (isLoading) {
    return <LoadingBall />;
  } else if (!admission || !groups) {
    return <div>Feil: klarte ikke laste inn grupper.</div>;
  } else {
    const group = (groups ?? []).find((group) => group.pk === groupId);
    if (!group) return <div>Feil: Ugyldig gruppe</div>;
    if (
      !admission.userdata.is_admin &&
      !admission.userdata.represented_groups.includes(group.name)
    ) {
      return <div>Du har ikke tilgang til å redigere denne gruppen.</div>;
    }

    return (
      <PageWrapper>
        <HeaderCard>
          <GroupLogoWrapper>
            {group.logo ? (
              <GroupLogo src={group.logo} alt="" aria-hidden="true" />
            ) : (
              <GroupLogoFallback aria-hidden="true">
                {group.name.slice(0, 1)}
              </GroupLogoFallback>
            )}
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
  gap: var(--spacing-md);
  width: 100%;
`;

const HeaderCard = styled.div`
  width: 100%;
  padding-bottom: var(--spacing-xl);
  border-bottom: var(--border-width-default) solid var(--color-border-soft);
`;

const SectionEyebrow = styled.span`
  display: inline-block;
  margin-bottom: var(--spacing-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-muted);
`;

const GroupTitle = styled.h1`
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
`;

const GroupDescription = styled.p`
  margin: var(--spacing-md) 0 0;
  color: var(--color-text-muted);
  line-height: var(--line-height-base);
`;

const GroupLogoFallback = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: var(--avatar-size-lg);
  height: var(--avatar-size-lg);
  border-radius: var(--border-radius-pill);
  background: var(--color-brand-soft);
  color: var(--color-brand);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-bold);
`;
