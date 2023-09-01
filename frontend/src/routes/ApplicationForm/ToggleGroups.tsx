/**
 *
 * A small toggle (add/remove) for the small group toggle on the
 * application form page.
 *
 */

import React from "react";
import styled from "styled-components";
import { Link, useParams } from "react-router-dom";
import MiniToggleGroup from "./MiniToggleGroup";
import { media } from "src/styles/mediaQueries";
import { Group } from "src/types";

interface ToggleGroupsProps {
  groups: Group[];
  selectedGroups: any;
  toggleGroup: (name: string) => void;
}

const ToggleGroups: React.FC<ToggleGroupsProps> = ({
  groups,
  selectedGroups,
  toggleGroup,
}) => {
  const { admissionSlug } = useParams();
  const isRevy = admissionSlug === "revy";

  const ChooseGroupsItems = groups.map((group, index) => (
    <MiniToggleGroup
      name={group.name}
      logo={group.logo}
      key={group.name + "-" + index}
      isChosen={!!selectedGroups[group.name.toLowerCase()]}
      toggleGroup={toggleGroup}
    />
  ));

  return (
    <Wrapper>
      <Title>Endre dine valg</Title>
      <Tooltip>
        Klikk på logoene til {isRevy ? "gruppene" : "komiteene"} for å legge
        til/fjerne dem fra søknaden.
      </Tooltip>
      <IconsWrapper>{ChooseGroupsItems}</IconsWrapper>
      <LinkToOverview to={`/${admissionSlug}/velg-komiteer`}>
        Eller gå tilbake til oversikten for å lese mer
      </LinkToOverview>
    </Wrapper>
  );
};

export default ToggleGroups;

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
  grid-area: togglegroups;
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
