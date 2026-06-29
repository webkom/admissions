import React from "react";
import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import readmeIfy from "src/components/ReadmeLogo";

interface GroupCardProps {
  onToggle: (arg0: string) => void;
  isChosen: boolean;
  name: string;
  description: string;
  readMoreLink: string;
  logo: string;
  isRevy: boolean;
  isRevyBoard: boolean;
}

const GroupCard: React.FC<GroupCardProps> = ({
  onToggle,
  isChosen,
  name,
  description,
  readMoreLink,
  logo,
  isRevy,
  isRevyBoard,
}) => {
  return (
    <Card
      onClick={() => onToggle(name)}
      $isChosen={isChosen}
      $isRevy={isRevy}
      $isRevyBoard={isRevyBoard}
    >
      <Header>
        {!(isRevy || isRevyBoard) && <Logo src={logo} />}
        <Name>{readmeIfy(name)}</Name>
      </Header>
      <Description>{readmeIfy(description, true)}</Description>
      {!(isRevy || isRevyBoard) && (
        <LearnMoreLink href={`${readMoreLink}`} target="_blank">
          Les mer på abakus.no
        </LearnMoreLink>
      )}
      <SelectedMark $isChosen={isChosen}>
        {isChosen ? (
          <SelectedMarkText $isChosen={isChosen}>
            Valgt <span>- klikk for å fjerne</span>
          </SelectedMarkText>
        ) : (
          <SelectedMarkText>
            Velg {isRevy ? "gruppe" : isRevyBoard ? "stilling" : "komité"}
          </SelectedMarkText>
        )}
      </SelectedMark>
    </Card>
  );
};

export default GroupCard;

/** Styles **/

interface GroupCardElementsStyledProps {
  $isChosen?: boolean;
}

type GroupCardStyledProps = GroupCardElementsStyledProps & {
  $isRevy: boolean;
  $isRevyBoard: boolean;
};

const Card = styled.div<GroupCardStyledProps>`
  display: flex;
  flex-direction: column;
  background: var(--color-surface-base, white);
  box-shadow: ${(props) =>
    props.$isChosen ? "var(--shadow-md)" : "var(--shadow-sm)"};
  border: 1px solid
    ${(props) =>
      props.$isChosen ? "var(--color-brand)" : "var(--color-border-soft)"};
  box-sizing: border-box;
  padding: 2rem;
  border-radius: var(--border-radius-md);
  overflow: hidden;
  position: relative;
  transition: var(--transition-base);
  height: 100%;

  &:hover {
    cursor: pointer;
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
    border-color: ${(props) =>
      props.$isChosen
        ? "var(--color-brand)"
        : "var(--color-brand-strong-border)"};
  }

  ${media.handheld`
    padding: 1.5rem;
  `};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
`;

const Name = styled.h2`
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text-strong);
  letter-spacing: -0.03em;

  ${media.handheld`
    font-size: 1.125rem;
  `};
`;

const Description = styled.p`
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.55;
  color: var(--color-text-body);
  flex-grow: 1;
  margin-bottom: 1.5rem;
`;

const Logo = styled.img`
  object-fit: contain;
  width: 40px;
  height: 40px;
  border-radius: var(--border-radius-sm);
`;

const LearnMoreLink = styled.a`
  font-weight: 600;
  font-size: 0.8125rem;
  color: var(--color-brand);
  margin-bottom: 2.5rem;

  &:hover {
    text-decoration: underline;
  }
`;

const SelectedMark = styled.div<GroupCardElementsStyledProps>`
  width: 100%;
  padding: 0.75rem 0;
  position: absolute;
  left: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  background: ${(props) =>
    props.$isChosen ? "var(--color-brand)" : "var(--color-surface-subtle)"};
  transition: var(--transition-base);
`;

const SelectedMarkText = styled.span<GroupCardElementsStyledProps>`
  color: ${(props) => (props.$isChosen ? "white" : "var(--color-text-body)")};
  font-size: 0.875rem;
  font-weight: 600;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  span {
    opacity: 0.8;
    font-size: 0.75rem;
    font-weight: 400;
  }
`;
