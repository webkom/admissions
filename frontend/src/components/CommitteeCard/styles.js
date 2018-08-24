import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

export const Card = styled.div`
  background: ${props =>
    props.isChosen ? "linear-gradient(rgba(255,0,0,0.5), white)" : "white"};
  box-shadow: ${props =>
    props.isChosen
      ? "0 1px 4px rgba(0, 0, 0, 0.8)"
      : "0 1px 4px rgba(0, 0, 0, 0.04)"};
  display: grid;
  position: relative;
  grid-template-columns: 1fr 3fr;
  grid-template-rows: auto;
  grid-template-areas:
    "logo title"
    "logo text"
    "readmore text";

  box-sizing: border-box;
  margin: 1em;
  padding: 2em 1em;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.09);
  overflow: hidden;

  &:hover {
    cursor: pointer;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
  }

  ${media.handheld`
    grid-template-columns: 1fr 5fr 2fr;
    grid-template-rows: 1fr 3fr;
    grid-template-areas:
      "logo title readmore"
      "text text text";
    `};
`;

export const Title = styled.h2`
  margin: 0;
  grid-area: title;
  text-align: center;
  margin-bottom: 4dsem;
  ${media.handheld`
    padding: 0
    text-align: left;
    margin-left: 0.5em;
    `};
`;

export const Text = styled.p`
  padding: 0 1.5em;
  grid-area: text;
  flex: 1;
  margin-top: 0;
  text-align: center;
  ${media.handheld`
    padding: 0;
    font-size: 0.8em;
    margin-top: 1em;
    `};
`;

export const Logo = styled.img`
  object-fit: scale-down;
  grid-area: logo;
  width: 100%;
  ${media.handheld`
    width: 80%;
    align-self: center;
    justify-self: left;
    `};
`;

export const Mark = styled.p`
  visibility: ${props => (props.isChosen ? "visible" : "hidden")};
  position: absolute;
  color white;
  font-size: 1.5em;
  font-weight: bold;
  right: 5px;
  top: -1em;
`;

export const LearnMore = styled.a`
  font-weight: normal;
  margin: 1em;
  grid-area: readmore;
  text-align: center;
  align-self: center;

  &:hover {
    font-weight: bold;
  }

  ${media.handheld`
    margin: 0;
    `};
`;
