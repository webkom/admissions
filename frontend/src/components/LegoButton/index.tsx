import React, { PropsWithChildren } from "react";
import styled, { css } from "styled-components";
import Icon from "src/components/Icon";
import { Link } from "react-router-dom";
import { media } from "src/styles/mediaQueries";

// See https://ionicons.com/ for icon names. md or ios as prefix.

type ButtonStyle = "primary" | "secondary" | "tertiary";

interface LegoButtonProps extends PropsWithChildren {
  buttonStyle?: ButtonStyle;
  href?: string;
  to?: string;
  icon?: string;
  disabled?: boolean;
  iconPrefix?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  size?: "small" | "normal";
  type?: "button" | "submit" | "reset";
}

const LegoButton: React.FC<LegoButtonProps> = ({
  buttonStyle = "primary",
  href,
  children,
  to,
  icon,
  disabled,
  iconPrefix = "md",
  onClick,
  size = "normal",
  type = "button",
}) => {
  if (to) {
    return (
      <ILegoRouterLink
        to={to}
        $buttonStyle={buttonStyle}
        onClick={onClick}
        $size={size}
        disabled={disabled}
      >
        <Text $buttonStyle={buttonStyle}>{children}</Text>
        {icon && <Icon name={icon} prefix={iconPrefix} />}
      </ILegoRouterLink>
    );
  } else if (href) {
    return (
      <ILegoLink
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        $buttonStyle={buttonStyle}
        onClick={onClick}
        disabled={disabled}
      >
        <Text $buttonStyle={buttonStyle}>{children}</Text>
        {icon && <Icon name={icon} prefix={iconPrefix} />}
      </ILegoLink>
    );
  }

  return (
    <ILegoButton
      $buttonStyle={buttonStyle}
      onClick={onClick}
      disabled={disabled}
      $size={size}
      type={type}
    >
      <Text $buttonStyle={buttonStyle}>{children}</Text>
      {icon && <Icon name={icon} prefix={iconPrefix} />}
    </ILegoButton>
  );
};

export default LegoButton;

/** Styles **/

interface LegoButtonStyleProps {
  $buttonStyle: ButtonStyle;
  disabled?: boolean;
  $size?: "small" | "normal";
}

const ILegoRouterLink = styled(Link)<LegoButtonStyleProps>`
  /** Common styles **/
  display: inline-flex;
  justify-content: center;
  align-items: center;
  outline: none;

  &:hover {
    opacity: 0.7;
  }

  /** Primary style (also base for tertiary) **/
  ${({ $buttonStyle }) =>
    ($buttonStyle === "primary" || $buttonStyle === "tertiary") &&
    css<LegoButtonStyleProps>`
      background: var(--lego-red);
      color: var(--lego-white);
      border: 1px solid #bd1c1c;
      box-shadow: 0px 4px 4px rgba(0, 0, 0, 0.25);
      border-radius: 10px;
      padding: ${({ $size }) =>
        $size === "small" ? "7.5px 15px" : "10px 30px"};

      > i {
        margin-left: ${({ $size }) => ($size === "small" ? "10px" : "25px")};
        font-size: ${({ $size }) => ($size === "small" ? "1.2rem" : "1.8rem")};
      }
    `}

  /** Secondary style **/
  ${({ $buttonStyle }) =>
    $buttonStyle === "secondary" &&
    css`
      color: var(--lego-red);

      > i {
        margin-left: 20px;
        font-size: 1.8rem;
      }

      ${media.handheld`        
        > i {
        margin-left: 15px;
        font-size: 1.6rem;
         }
      `}
    `}

  /** Tertiary style **/
  ${({ $buttonStyle }) =>
    $buttonStyle === "tertiary" &&
    css`
      background: var(--lego-font-color);
      border: 1px solid var(--lego-font-color);
    `}

  /** Disabled primary & tertiary style **/
  ${({ disabled, $buttonStyle }) =>
    disabled &&
    ($buttonStyle === "primary" || $buttonStyle === "tertiary") &&
    css`
      background: var(--lego-gray-medium);
      border: 1px solid var(--lego-gray-dark);
      color: var(--lego-gray-dark);
      box-shadow: 0px 4px 4px rgba(0, 0, 0, 0.1);
    `}
`;

const Text = styled.span<LegoButtonStyleProps>`
  /** Common styles **/
  font-weight: 600;
  line-height: 1rem;
  white-space: nowrap;
  font-family: var(--font-family);

  /** Primary style & Tertiary style **/
  ${({ $buttonStyle }) =>
    ($buttonStyle === "primary" || $buttonStyle === "tertiary") &&
    css<LegoButtonStyleProps>`
      font-size: ${({ $size }) => ($size === "small" ? "1rem" : "1.2rem")};
      margin-bottom: 3px;
    `}

  /** Secondary style **/
  ${({ $buttonStyle }) =>
    $buttonStyle === "secondary" &&
    css`
      font-size: 1.1rem;
      display: inline-block;
      padding-bottom: 13px;
      position: relative;

      &:before {
        content: "";
        position: absolute;
        width: 85%;
        border-bottom: 2px solid var(--lego-red);
        bottom: 0;
        left: 7.5%;
      }

      ${media.handheld`
        font-size: 1.1rem;
      `}
    `}
`;

const ILegoLink = ILegoRouterLink.withComponent("a");
const ILegoButton = ILegoRouterLink.withComponent("button");
