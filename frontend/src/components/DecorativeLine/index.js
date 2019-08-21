import styled from "styled-components";

const DecorativeLine = styled.div.attrs(props => ({
  vertical: props.vertical ? true : false,
  red: props.red ? true : false
}))`
  display: block;
  background: ${props =>
    props.red ? "var(--lego-red)" : "var(--lego-gray-medium)"};
  width: ${props => (props.vertical ? "5px" : "auto")};
  height: ${props => (props.vertical ? "auto" : "5px")};
  min-height: ${props => (props.vertical ? "10px" : "0")};
  flex-shrink: 0;
  flex-grow: 0;
`;

export default DecorativeLine;
