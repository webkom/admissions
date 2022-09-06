import React from "react";
import GroupCard from "src/components/GroupCard";
import LegoButton from "src/components/LegoButton";
import Icon from "src/components/Icon";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import { useGroups } from "../../query/hooks";

const GroupsPage = ({ selectedGroups, toggleGroup }) => {
  const { data: groups } = useGroups();

  const handleToggleGroup = (name) => {
    toggleGroup(name.toLowerCase());
  };

  const GroupCards = groups.map((group, index) => (
    <GroupCard
      name={group.name}
      description={group.description}
      logo={group.logo}
      key={group.name + "-" + index}
      onToggle={handleToggleGroup}
      isChosen={!!selectedGroups[group.name.toLowerCase()]}
      readMoreLink={group.detail_link}
    />
  ));

  const hasSelectedAnything = () => {
    return Object.values(selectedGroups).filter((a) => a).length;
  };

  return (
    <PageWrapper>
      <Title>Velg de gruppene du vil søke på og gå videre</Title>
      <ReadMoreLink href="//abakus.no/pages/grupper/104-revyen" target="_blank">
        Les mer om revygruppene på abakus.no
      </ReadMoreLink>
      <GroupsWrapper>{GroupCards}</GroupsWrapper>
      <NextButtonWrapper>
        <LegoButton
          to="/min-soknad"
          icon="arrow-forward"
          iconPrefix="ios"
          disabled={!hasSelectedAnything()}
        >
          Gå videre
        </LegoButton>
        {!hasSelectedAnything() && (
          <ErrorMessage>
            <Icon name="information-circle-outline" />
            Du må velge en eller flere grupper før du kan gå videre
          </ErrorMessage>
        )}
      </NextButtonWrapper>
    </PageWrapper>
  );
};

export default GroupsPage;

/** Styles **/

export const PageWrapper = styled.div`
  width: 100%;
  padding: 0 1rem;
  margin: 0 auto 4em auto;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
`;

export const Title = styled.h1`
  color: rgba(129, 129, 129, 0.59);
  font-size: 1.3rem;
  margin: 1.6rem 0 0;
  line-height: 1.5em;

  ${media.handheld`
    margin: 1.5rem 1rem;
    font-size: 1.2rem;
    line-height: 1.2em;
  `};
`;

const ReadMoreLink = styled.a`
  text-align: center;
  margin: 1em 0 2em;
  font-weight: 600;
  align-self: center;
  font-size: 1rem;

  &:hover {
    text-decoration: underline;
  }
`;

export const GroupsWrapper = styled.div`
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

export const NextButtonWrapper = styled.div`
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

export const ErrorMessage = styled.div`
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.3em;
  display: flex;
  align-items: center;
  margin-top: 1rem;

  > i {
    font-size: 1.5rem;
    margin-right: 0.8rem;
    color: var(--lego-red);
  }

  ${media.handheld`
    font-size: 0.9rem;
    max-width: 70vw;
  `};
`;