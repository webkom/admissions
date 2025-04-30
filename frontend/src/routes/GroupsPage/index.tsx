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
  padding: 0 1rem;
  margin: 0 auto 4em auto;
  min-height: calc(
    100vh - 70px - 2rem - 4em
  ); /* Calculated to never overflow navbar/padding/margin */
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

const Title = styled.h1`
  color: rgba(129, 129, 129, 0.59);
  font-size: 1.3rem;
  margin: 1.6rem 0 2rem;
  line-height: 1.5em;

  ${media.handheld`
    margin: 1.5rem 1rem;
    font-size: 1.2rem;
    line-height: 1.2em;
  `};
`;

const GroupsWrapper = styled.div`
  display: grid;
  max-width: calc(460px + 460px + 2rem);
  grid-template-columns: 1fr 1fr;
  grid-gap: 2rem 1.5rem;
  margin: auto;

  ${media.handheld`
    grid-template-columns: 1fr;
    grid-gap: 1.5rem;
    `};
`;

const NextButtonWrapper = styled.div`
  width: 100%;
  margin-top: 4em;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  ${media.handheld`
    margin-top: 2.5rem;
  `};
`;

const ErrorMessage = styled.div`
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.3em;
  display: flex;
  align-items: center;
  margin-top: 1rem;

  > i {
    font-size: 1.5rem;
    margin-right: 0.8rem;
    color: var(--lego-red-color);
  }

  ${media.handheld`
    font-size: 0.9rem;
    max-width: 70vw;
  `};
`;
