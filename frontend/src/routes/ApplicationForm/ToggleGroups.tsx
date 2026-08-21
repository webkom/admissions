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
import { SelectedGroups } from ".";

interface ToggleGroupsProps {
  groups: Group[];
  selectedGroups: SelectedGroups;
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
        Klikk på symbolene til {isRevy ? "gruppene" : "komiteene"} for å legge
        til/fjerne dem fra søknaden. Hvis du fjerner en{" "}
        {isRevy ? "gruppe" : "komité"} du allerede har sendt inn søknad til,
        skjer det først når du sender inn på nytt — teksten slettes da permanent
        for den {isRevy ? "gruppen" : "komiteen"}, og de får beskjed anonymt om
        at du trakk deg.
      </Tooltip>
      <IconsWrapper>{ChooseGroupsItems}</IconsWrapper>
      <LinkToOverview to={`/${admissionSlug}/velg-grupper`}>
        Eller gå tilbake til oversikten for å lese mer
      </LinkToOverview>
    </Wrapper>
  );
};

export default ToggleGroups;

/** Styles **/

const Wrapper = styled.div`
  border: var(--border-width-strong) solid var(--color-border-soft);
  border-radius: var(--border-radius-lg);
  padding: var(--spacing-xl);
  max-width: var(--form-toggle-width);

  ${media.portrait`
    max-width: 100%;
    padding: var(--spacing-lg) var(--spacing-xl);

  `};

  ${media.handheld`
     margin: auto;
     max-width: var(--form-toggle-width);
  `};
`;

const Title = styled.h4`
  color: var(--color-text-muted);
  margin: 0;
`;

const Tooltip = styled.p`
  color: var(--color-text-subtle);
  margin-top: 0;
  margin-bottom: var(--spacing-md);
  font-size: var(--font-size-detail);
  line-height: var(--line-height-tiny);
`;

const IconsWrapper = styled.div`
  grid-area: togglegroups;
  display: grid;
  grid-template-columns: repeat(4, var(--avatar-size-sm));
  grid-template-rows: auto;
  gap: var(--spacing-xs) var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm);

  ${media.portrait`
    grid-template-columns: repeat(8, var(--avatar-size-sm));
  `};

  ${media.handheld`
    grid-template-columns: repeat(4, var(--avatar-size-sm));
  `};
`;

const LinkToOverview = styled(Link)`
  margin-top: var(--spacing-md);
  display: inline-block;
  line-height: var(--line-height-tiny);
  text-decoration: underline;
  font-size: var(--font-size-detail);
  text-align: center;
  font-weight: var(--font-weight-medium);
  width: 100%;
`;
