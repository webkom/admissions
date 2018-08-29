import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

export const Wrapper = styled.button`
  display: flex;
  flex: 1 1 20%;
  align-items: center;
  margin: 0.3em;
  font-family: Raleway, "Helvetica Neue", Arial, sans-serif;

  ${media.handheld`
    flex: 1 1 45%;
    `};
`;

export const Icon = styled.span`
  font-weight: bold;
  font-size: 2em;
  width: 100%;
  height: 100%;
  color: white;
  position: absolute;
  margin: 0;
  text-align: center;
  display: flex;
  align-self: center;
  justify-content: center;
  z-index: 1;
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 50%;
`;

export const IconWrapper = styled.div`
  width: 2.5em;
  height: 2.5em;
  position: relative;

  filter: ${props => (props.isChosen ? "none" : "grayscale()")};

  &:hover {
    filter: none;
    opacity: 0.5;
  }
  &:hover > img {
    opacity: 0.5;
  }

  &:active {
    opacity: 1;
  }
`;

export const Logo = styled.img`
  object-fit: scale-down;
  width: 100%;
  opacity: 0.8;

  filter: inherit;

  &:hover {
    filter: inherit;
    opacity: 0.5;
  }
`;

export const Name = styled.span`
  font-weight: bold;
  margin-left: 0.5em;
  font-family: Raleway, "Helvetica Neue", Arial, sans-serif;
  font-size: 1rem;
  color: #303030;
`;
