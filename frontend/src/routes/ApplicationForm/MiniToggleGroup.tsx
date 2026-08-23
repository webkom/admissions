/**
 *
 * A small toggle (add/remove) for the small group toggle on the
 * application form page.
 *
 */

import React, { useEffect, useState } from "react";
import styled from "styled-components";

interface MiniToggleGroupProps {
  name: string;
  logo: string | null;
  toggleGroup: (name: string) => void;
  isChosen: boolean;
}

const MiniToggleGroup: React.FC<MiniToggleGroupProps> = ({
  name,
  logo,
  toggleGroup,
  isChosen,
}) => {
  const [logoFailed, setLogoFailed] = useState(false);

  useEffect(() => {
    setLogoFailed(false);
  }, [logo]);

  const showLogo = Boolean(logo) && !logoFailed;

  return (
    <Wrapper
      type="button"
      onClick={() => toggleGroup(name.toLowerCase())}
      $isChosen={isChosen}
      aria-label={`${isChosen ? "Fjern" : "Velg"} ${name}`}
      title={name}
    >
      {showLogo ? (
        <Logo
          src={logo ?? undefined}
          alt=""
          aria-hidden="true"
          onError={() => setLogoFailed(true)}
        />
      ) : (
        <LogoFallback
          aria-hidden="true"
          data-cy="group-logo-fallback"
          data-group-name={name}
        >
          {getGroupInitials(name)}
        </LogoFallback>
      )}
    </Wrapper>
  );
};

export default MiniToggleGroup;

/** Styles **/

interface WrapperProps {
  $isChosen: boolean;
}

const Wrapper = styled.button<WrapperProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  width: var(--group-toggle-size-sm);
  height: var(--group-toggle-size-sm);
  border: 0;
  border-radius: var(--border-radius-pill);
  background: transparent;
  opacity: ${(props) => (props.$isChosen ? "1" : "var(--opacity-unselected)")};
`;

const Logo = styled.img`
  object-fit: scale-down;
  width: 100%;
  height: 100%;
`;

const LogoFallback = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  border: var(--border-width-default) solid var(--color-brand);
  border-radius: var(--border-radius-pill);
  background: var(--color-brand-soft);
  color: var(--color-brand);
  font-size: var(--font-size-detail);
  font-weight: var(--font-weight-bold);
`;

const getGroupInitials = (name: string) => {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
  return initials || "?";
};
