import styled from "styled-components";

interface ButtonProps {
  width?: string | number;
  fontSize?: string | number;
  margin?: string | number;
}

const Button = styled.button<ButtonProps>`
  color: #fff;
  font-weight: bold;
  background: gray;
  border: 1px solid darkgray;
  padding: 10px 30px;
  border-radius: 4px;
  outline: none;
  display: block;
  font-size: ${(props) => props.fontSize || "1em"};
  font-family: var(--font-family);
  width: ${(props) => props.width || "auto"};
  margin: ${(props) => props.margin || "0"};
`;

export default Button;
