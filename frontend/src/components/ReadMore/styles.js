import styled from "styled-components";
import { Card } from "src/components/Card";

export const Ellipsis = styled.span`
  letter-spacing: 3px;
  font-weight: bold;
`;

export const EllipsisToggle = styled.a`
  display: flex;
  justify-content: center;
  width: 100%;
  padding-top: 1em;
`;

export const EllipsisWrapper = styled.span`
  color: #c0392b;
`;

export const Wrapper = styled(Card)`
  grid-area: applicationText;
  margin: 0;
  padding: 1.5em;
  font-size: 0.9em;
  font-family: Raleway, "Helvetica Neue", Arial, sans-serif;
`;
