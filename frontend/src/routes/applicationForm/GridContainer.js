import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

const GridContainer = styled.div`
  display: grid;
  margin: 0.5em auto;
  width: 95%;
  grid-template-columns: 3fr 1fr;
  grid-template-rows: auto;
  grid-template-areas: "form .";
  ${media.handheld`
    grid-template-columns: 1fr;
    grid-template-rows: auto;
    grid-template-areas:
    "committees"
    "form";
    grid-gap: 1em;
    `};
`;

export default GridContainer;
