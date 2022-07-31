import React from "react";
import CommitteeCard from "src/components/CommitteeCard";
import LegoButton from "src/components/LegoButton";
import Icon from "src/components/Icon";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const CommitteesPage = ({
  committees,
  selectedCommittees,
  toggleCommittee,
}) => {
  const handleToggleCommittee = (name) => {
    toggleCommittee(name.toLowerCase());
  };

  const CommitteeCards = committees.map((committee, index) => (
    <CommitteeCard
      name={committee.name}
      description={committee.description}
      logo={committee.logo}
      key={committee.name + "-" + index}
      onToggle={handleToggleCommittee}
      isChosen={!!selectedCommittees[committee.name.toLowerCase()]}
      readMoreLink={committee.detail_link}
    />
  ));

  const hasSelectedAnything = () => {
    return Object.values(selectedCommittees).filter((a) => a).length;
  };

  return (
    <PageWrapper>
      <Title>Velg de komiteene du vil søke på og gå videre</Title>
      <CommitteesWrapper>{CommitteeCards}</CommitteesWrapper>
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
            Du må velge en eller flere komiteer før du kan gå videre
          </ErrorMessage>
        )}
      </NextButtonWrapper>
    </PageWrapper>
  );
};

export default CommitteesPage;

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
  margin: 1.6rem 0 2rem;
  line-height: 1.5em;

  ${media.handheld`
    margin: 1.5rem 1rem;
    font-size: 1.2rem;
    line-height: 1.2em;
  `};
`;

export const CommitteesWrapper = styled.div`
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
