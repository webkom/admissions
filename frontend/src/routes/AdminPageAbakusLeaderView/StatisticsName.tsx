import styled from "styled-components";

interface SmallDescriptionProps {
  capitalize?: boolean;
}

const SmallDescription = styled.span<SmallDescriptionProps>`
  font-size: 0.8em;
  font-weight: bold;
  text-transform: ${(props) => (props.capitalize ? "capitalize" : "normal")};
`;

export default SmallDescription;
