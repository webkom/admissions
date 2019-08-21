import React from "react";
import styled, { css } from "styled-components";
import Icon from "src/components/Icon";
import { Link } from "react-router-dom";
import { media } from "src/styles/mediaQueries";

// See https://ionicons.com/ for icon names. md or ios as prefix.

const LegoButton = ({
  buttonStyle = "primary",
  href,
  children,
  to,
  icon,
  disabled,
  iconPrefix = "md",
  onClick
}) => {
  const getButtonStyle = style => {
    switch (style) {
      case "primary":
        return "primary";
      case "secondary":
        return "secondary";
    }
    console.warn(`Style ${style} not found -- fallback to primary`);
    return "primary";
  };

  if (to) {
    return (
      <ILegoRouterLink
        to={to}
        buttonstyle={getButtonStyle(buttonStyle)}
        onClick={onClick}
        disabled={disabled}
      >
        <Text buttonstyle={getButtonStyle(buttonStyle)}>{children}</Text>
        {icon && <Icon name={icon} prefix={iconPrefix} />}
      </ILegoRouterLink>
    );
  } else if (href) {
    return (
      <ILegoLink
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        buttonstyle={getButtonStyle(buttonStyle)}
        onClick={onClick}
        disabled={disabled}
      >
        <Text buttonstyle={getButtonStyle(buttonStyle)}>{children}</Text>
        {icon && <Icon name={icon} prefix={iconPrefix} />}
      </ILegoLink>
    );
  }

  return (
    <ILegoButton
      buttonstyle={getButtonStyle(buttonStyle)}
      onClick={onClick}
      disabled={disabled}
    >
      <Text buttonstyle={getButtonStyle(buttonStyle)}>{children}</Text>
      {icon && <Icon name={icon} prefix={iconPrefix} />}
    </ILegoButton>
  );
};

export default LegoButton;

/** Styles **/

const ILegoRouterLink = styled(Link)`
  /** Common styles **/
  display: inline-flex;
  justify-content: center;
  align-items: center;
  outline: none;

  &:hover {
    opacity: 0.7;
  }

  /** Primary style **/
  ${props =>
    props.buttonstyle === "primary" &&
    css`
      background: var(--lego-red);
      color: var(--lego-white);
      border: 1px solid #bd1c1c;
      box-shadow: 0px 4px 4px rgba(0, 0, 0, 0.25);
      border-radius: 10px;
      padding: 10px 30px;

      > i {
        margin-left: 25px;
        font-size: 1.8rem;
      }
      ${props =>
        props.disabled &&
        css`
          background: var(--lego-gray-medium);
          border: 1px solid var(--lego-gray-dark);
          color: var(--lego-gray-dark);
          box-shadow: 0px 4px 4px rgba(0, 0, 0, 0.1);
        `}
    `}

  /** Secondary style **/
  ${props =>
    props.buttonstyle === "secondary" &&
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
`;

const Text = styled.span`
  /** Common styles **/
  font-weight: 600;
  line-height: 1rem;
  white-space: nowrap;
  font-family: var(--font-family);

  /** Primary style **/
  ${props =>
    props.buttonstyle === "primary" &&
    css`
      font-size: 1.2rem;
      margin-bottom: 3px;
    `}

  /** Secondary style **/
  ${props =>
    props.buttonstyle === "secondary" &&
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
