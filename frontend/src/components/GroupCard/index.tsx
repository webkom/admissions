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
  let safeReadMoreLink: string | null = null;
  try {
    const url = new URL(readMoreLink);
    if (
      url.protocol === "https:" &&
      (url.hostname === "abakus.no" || url.hostname.endsWith(".abakus.no"))
    ) {
      safeReadMoreLink = url.href;
    }
  } catch {
    safeReadMoreLink = null;
  }

  return (
    <Card
      onClick={() => onToggle(name)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle(name);
        }
      }}
      role="checkbox"
      aria-checked={isChosen}
      tabIndex={0}
      $isChosen={isChosen}
      $isRevy={isRevy}
      $isRevyBoard={isRevyBoard}
    >
      <Header>
        {!(isRevy || isRevyBoard) && <Logo src={logo} alt="" />}
        <Name>{readmeIfy(name)}</Name>
      </Header>
      <Description>{readmeIfy(description, true)}</Description>
      {!(isRevy || isRevyBoard) && safeReadMoreLink && (
        <LearnMoreLink
          href={safeReadMoreLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
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
  background: var(--color-surface-base);
  box-shadow: ${(props) =>
    props.$isChosen ? "var(--shadow-md)" : "var(--shadow-sm)"};
  border: 1px solid
    ${(props) =>
      props.$isChosen ? "var(--color-brand)" : "var(--color-border-soft)"};
  box-sizing: border-box;
  padding: var(--spacing-xl);
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
    padding: var(--spacing-lg);
  `};
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-md);
`;

const Name = styled.h2`
  margin: 0;
  font-size: var(--font-size-heading-xs);
  font-weight: 700;
  color: var(--color-text-strong);
  letter-spacing: -0.03em;

  ${media.handheld`
    font-size: var(--font-size-lg);
  `};
`;

const Description = styled.p`
  margin: 0;
  font-size: var(--font-size-sm);
  line-height: 1.55;
  color: var(--color-text-body);
  flex-grow: 1;
  margin-bottom: var(--spacing-lg);
`;

const Logo = styled.img`
  object-fit: contain;
  width: 40px;
  height: 40px;
  border-radius: var(--border-radius-sm);
`;

const LearnMoreLink = styled.a`
  font-weight: 600;
  font-size: var(--font-size-detail);
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
  color: ${(props) =>
    props.$isChosen ? "var(--color-absolute-white)" : "var(--color-text-body)"};
  font-size: var(--font-size-sm);
  font-weight: 600;
  user-select: none;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);

  span {
    opacity: 0.8;
    font-size: var(--font-size-xs);
    font-weight: 400;
  }
`;
