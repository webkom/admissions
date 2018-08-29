import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

export const Dash = styled.span`
  margin-right: 0.3em;
`;

export const Name = styled.span`
  color: #636363;
  margin: 0 0.3em;
`;

export const Wrapper = styled.div`
  background: #d6d4d2;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-self: center;
  min-width: 50%;
  color: white;
  padding: 0.2em;
  margin: 1em 0;
  border-radius: 10px;
  cursor: default;

  ${media.handheld`
    width: 100%;
    `};
`;
