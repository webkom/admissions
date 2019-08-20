import styled from "styled-components";

const DecorativeLine = styled.div.attrs(props => ({
  vertical: props.vertical ? true : false,
  color: props.color === "red" ? "var(--lego-red)" : "var(--lego-gray-medium)"
}))`
  background: ${props => props.color};
  display: block;
  width: ${props => (props.vertical ? "18px" : "auto")};
  height: ${props => (props.vertical ? "auto" : "18px")};
  min-height: ${props => (props.vertical ? "10px" : "0")};
`;

export default DecorativeLine;
