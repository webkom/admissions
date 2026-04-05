import React from "react";
import GroupCard from "src/components/GroupCard";
import Icon from "src/components/Icon";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import { useAdmission } from "src/query/hooks";
import { useParams } from "react-router-dom";
import LinkButton from "src/components/LinkButton";

interface GroupsPageProps {
  selectedGroups: { [key: string]: boolean };
  toggleGroup: (name: string) => void;
}

const GroupsPage: React.FC<GroupsPageProps> = ({
  selectedGroups,
  toggleGroup,
}) => {
  const { admissionSlug } = useParams();
  const { data: admission } = useAdmission(admissionSlug ?? "");
  const { groups } = admission ?? {};

  const isRevy = admissionSlug === "revy";
  const isRevyBoard = admissionSlug === "revystyret";

  const handleToggleGroup = (name: string) => {
    toggleGroup(name.toLowerCase());
  };

  if (!groups) return null;

  const GroupCards = groups.map((group, index) => (
    <GroupCard
      name={group.name}
      description={group.description}
      logo={group.logo}
      key={group.name + "-" + index}
      onToggle={handleToggleGroup}
      isChosen={!!selectedGroups[group.name.toLowerCase()]}
      readMoreLink={group.detail_link}
      isRevy={isRevy}
      isRevyBoard={isRevyBoard}
    />
  ));

  const hasSelectedAnything = () => {
    return Object.values(selectedGroups).filter((a) => a).length;
  };

  return (
    <PageWrapper>
      <Title>
        Velg de{" "}
        {isRevy ? "gruppene" : isRevyBoard ? "stillingene" : "komiteene"} du vil
        søke på og gå videre
      </Title>
      <GroupsWrapper>{GroupCards}</GroupsWrapper>
      <NextButtonWrapper>
        <LinkButton
          to={`/${admissionSlug}/min-soknad`}
          disabled={!hasSelectedAnything()}
          secondary
        >
          Gå videre
        </LinkButton>
        {!hasSelectedAnything() && (
          <ErrorMessage>
            <Icon name="information-circle-outline" />
            Du må velge en eller flere{" "}
            {isRevy ? "grupper" : isRevyBoard ? "stillinger" : "komiteer"} før
            du kan gå videre
          </ErrorMessage>
        )}
      </NextButtonWrapper>
    </PageWrapper>
  );
};

export default GroupsPage;

/** Styles **/

const PageWrapper = styled.div`
  width: 100%;
  padding: 4rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
  min-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;

  ${media.handheld`
    padding: 2rem 1rem;
  `};
`;

const Title = styled.h1`
  color: #4b5563;
  font-size: 1.5rem;
  font-weight: 500;
  margin-bottom: 3rem;
  text-align: center;
  line-height: 1.4;

  ${media.handheld`
    font-size: 1.25rem;
    margin-bottom: 2rem;
  `};
`;

const GroupsWrapper = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  grid-gap: 2rem;
  width: 100%;

  ${media.handheld`
    grid-template-columns: 1fr;
    grid-gap: 1.5rem;
    `};
`;

const NextButtonWrapper = styled.div`
  width: 100%;
  margin-top: 4rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
`;

const ErrorMessage = styled.div`
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background-color: #fef2f2;
  border-radius: var(--border-radius-md);
  border: 1px solid #fee2e2;

  > i {
    font-size: 1.25rem;
    color: var(--lego-red-color, #e11d48);
  }
`;
