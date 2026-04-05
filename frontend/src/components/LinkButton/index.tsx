import React from "react";
import { Button } from "@webkom/lego-bricks";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import Icon from "../Icon";

type LinkButtonProps = {
  to: string;
  external?: boolean;
  icon?: string;
  iconPrefix?: string;
};

export const StyledButton = styled(Button)`
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 0.625rem !important;

  &::before {
    content: "";
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    flex-shrink: 0;
    background: currentColor;
    opacity: 0.8;
  }
`;

const LinkButton: React.FC<
  LinkButtonProps & React.ComponentProps<typeof Button>
> = ({ to, external = false, children, icon, iconPrefix, ...props }) => {
  const navigate = useNavigate();

  return (
    <StyledButton
      onClick={(e) => {
        if (external) {
          (window as Window).location = to;
          e.preventDefault();
        } else {
          navigate(to);
        }
      }}
      {...props}
    >
      {children}
      {icon && <Icon name={icon} prefix={iconPrefix} />}
    </StyledButton>
  );
};

export default LinkButton;
