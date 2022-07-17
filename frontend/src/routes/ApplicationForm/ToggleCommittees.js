/**
 *
 * A small toggle (add/remove) for the small committee toggle on the
 * application form page.
 *
 */

import React from "react";
import styled from "styled-components";
import { Link } from "react-router-dom";
import MiniToggleCommittee from "./MiniToggleCommittee";
import { media } from "src/styles/mediaQueries";

const ToggleCommittees = ({
  committees,
  selectedCommittees,
  toggleCommittee,
}) => {
  const ChooseCommitteesItems = committees.map((committee, index) => (
    <MiniToggleCommittee
      name={committee.name}
      key={committee.name + "-" + index}
      isChosen={!!selectedCommittees[committee.name.toLowerCase()]}
      toggleCommittee={toggleCommittee}
    />
  ));

  return (
    <Wrapper>
      <Title>Endre dine valg</Title>
      <Tooltip>
        Klikk på logoene til komiteene for å legge til/fjerne de fra søknaden.
      </Tooltip>
      <IconsWrapper>{ChooseCommitteesItems}</IconsWrapper>
      <LinkToOverview to="/velg-komiteer">
        Eller gå tilbake til oversikten for å lese mer
      </LinkToOverview>
    </Wrapper>
  );
};

export default ToggleCommittees;

/** Styles **/

const Wrapper = styled.div`
  border: 2px solid #ece3e3;
  border-radius: 13px;
  padding: 2rem;
  max-width: 290px;

  ${media.portrait`
    max-width: 100%;
    padding: 1.5rem 2rem;

  `};

  ${media.handheld`
     margin: auto;
     max-width: 290px;
  `};
`;

const Title = styled.h4`
  color: rgba(57, 75, 89, 0.75);
  margin: 0;
`;

const Tooltip = styled.p`
  color: rgba(57, 75, 89, 0.45);
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 0.8rem;
  line-height: 1rem;
`;

const IconsWrapper = styled.div`
  grid-area: togglecommittees;
  display: grid;
  grid-template-columns: repeat(4, 40px);
  grid-template-rows: auto;
  grid-gap: 5px 10px;
  padding: 5px 10px;

  ${media.portrait`
    grid-template-columns: repeat(8, 40px);
  `};

  ${media.handheld`
    grid-template-columns: repeat(4, 40px);
  `};
`;

const LinkToOverview = styled(Link)`
  margin-top: 1rem;
  display: inline-block;
  line-height: 1rem;
  text-decoration: underline;
  font-size: 0.8rem;
  text-align: center;
  font-weight: 500;
  width: 100%;
`;
