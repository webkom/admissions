import styled from "styled-components";

export const Wrapper = styled.div`
  padding: 1em;
  margin: 0.5em 0;

  display: grid;
  grid-template-columns: 6em 1fr;
  grid-template-rows: repeat(3, auto);
  grid-template-areas:
    "logo committeeName"
    "logo ."
    "logo applicationText";
  align-items: center;
`;

export const SmallDescriptionWrapper = styled.div`
  display: inline-flex;
  flex-direction: column;
  margin: 0 0.5em;
  justify-content: flex-start;
  line-height: 1;
`;

export const SmallDescription = styled.span`
  font-size: 0.8em;
  font-weight: bold;
`;

export const CommitteeName = styled.span`
  font-weight: bold;
  margin: 0.5em;
  font-size: 1.5em;

  grid-area: committeeName;
`;

export const Logo = styled.img`
  object-fit: scale-down;
  max-height: 5em;

  grid-area: logo;
  align-self: flex-start;
`;
