import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@webkom/lego-bricks";
import cn from "src/utils/cn";

type LinkButtonProps = {
  to: string;
  external?: boolean;
  fullWidth?: boolean;
  className?: string;
};

type StyledButtonProps = React.ComponentProps<typeof Button> & {
  $fullWidth?: boolean;
};

export const StyledButton: React.FC<StyledButtonProps> = ({
  $fullWidth = false,
  className,
  children,
  ...props
}) => (
  <Button
    className={cn(
      "!box-border !flex !items-center !justify-center !gap-2.5",
      $fullWidth ? "!w-full" : "!w-fit",
      className,
    )}
    {...props}
  >
    {children}
  </Button>
);

const LinkButton: React.FC<
  LinkButtonProps & React.ComponentProps<typeof Button>
> = ({
  to,
  external = false,
  children,
  fullWidth = false,
  className,
  ...props
}) => {
  const navigate = useNavigate();

  return (
    <StyledButton
      $fullWidth={fullWidth}
      className={className}
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
    </StyledButton>
  );
};

export default LinkButton;
