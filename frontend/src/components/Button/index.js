import styled from "styled-components";

const Button = styled.button.attrs(props => ({
  width: props.width || "auto",
  fontSize: props.fontSize || "1em",
  margin: props.margin || "0"
}))`
  color: #fff;
  font-weight: bold;
  background: gray;
  border: 1px solid darkgray;
  padding: 10px 30px;
  border-radius: 4px;
  outline: none;
  display: block;
  font-size: ${props => props.fontSize};
  font-family: var(--font-family);
  width: ${props => props.width};
  margin: ${props => props.margin};
`;

export default Button;
