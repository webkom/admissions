import React from "react";
import { Button } from "@webkom/lego-bricks";
import { useNavigate } from "react-router-dom";
import Icon from "../Icon";

type LinkButtonProps = {
  to: string;
  external?: boolean;
  icon?: string;
  iconPrefix?: string;
};

const LinkButton: React.FC<
  LinkButtonProps & React.ComponentProps<typeof Button>
> = ({ to, external = false, children, icon, iconPrefix, ...props }) => {
  const navigate = useNavigate();

  return (
    <Button
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
    </Button>
  );
};

export default LinkButton;
