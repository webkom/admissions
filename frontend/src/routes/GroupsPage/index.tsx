import React from "react";
import GroupCard from "src/components/GroupCard";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import { useAdmission } from "src/query/hooks";
import { useParams } from "react-router-dom";
import LinkButton from "src/components/LinkButton";
import { Info } from "lucide-react";

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
            <Info aria-hidden="true" />
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
  max-width: var(--lego-max-width);
  margin: 0 auto;
  min-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;

  ${media.handheld`
    padding: 2rem 1rem;
  `};
`;

const Title = styled.h1`
  color: var(--color-text-body);
  font-size: var(--font-size-heading-md);
  font-weight: 500;
  margin-bottom: 3rem;
  text-align: center;
  line-height: 1.4;

  ${media.handheld`
    font-size: var(--font-size-heading-xs);
    margin-bottom: var(--spacing-xl);
  `};
`;

const GroupsWrapper = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  grid-gap: var(--spacing-xl);
  width: 100%;

  ${media.handheld`
    grid-template-columns: 1fr;
    grid-gap: var(--spacing-lg);
    `};
`;

const NextButtonWrapper = styled.div`
  width: 100%;
  margin-top: 4rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-lg);
`;

const ErrorMessage = styled.div`
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background-color: var(--color-danger-bg);
  border-radius: var(--border-radius-md);
  border: 1px solid var(--color-danger-border);

  > i {
    font-size: var(--font-size-heading-xs);
    color: var(--lego-red-color);
  }
`;
