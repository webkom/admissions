import styled from "styled-components";

const SmallDescription = styled.span`
  font-size: 0.8em;
  font-weight: bold;
  text-transform: ${props => (props.capitalize ? "capitalize" : "normal")};
`;

export default SmallDescription;
