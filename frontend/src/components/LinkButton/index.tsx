import React from "react";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import Icon from "../Icon";
import { Button } from "@webkom/lego-bricks";


type LinkButtonProps = {
  to: string;
  external?: boolean;
  icon?: string;
  iconPrefix?: string;
  fullWidth?: boolean;
};

export const StyledButton = styled(Button)<{ $fullWidth?: boolean }>`
  && {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    width: ${(props) => (props.$fullWidth ? "100%" : "fit-content")};
    box-sizing: border-box;
  }
`;

const LinkButton: React.FC<
  LinkButtonProps & React.ComponentProps<typeof Button>
> = ({
  to,
  external = false,
  children,
  icon,
  iconPrefix,
  fullWidth = false,
  ...props
}) => {
  const navigate = useNavigate();

  return (
    <StyledButton
      $fullWidth={fullWidth}
      onClick={(e) => {
        if (external) {
          window.location.assign(to);
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
