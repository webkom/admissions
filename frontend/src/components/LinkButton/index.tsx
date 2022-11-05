import styled from "styled-components";
import { Link } from "react-router-dom";

interface LinkButtonProps {
  width?: string | number;
  height?: string | number;
  margin?: string | number;
  fontSize?: string | number;
  background?: string;
  color?: string;
  borderColor?: string;
}

const LinkButton = styled(Link).attrs((props: LinkButtonProps) => ({
  width: props.width || "auto",
  height: props.height || "auto",
  margin: props.margin || "0",
  fontSize: props.fontSize || "1.1em",
  background: props.background || "#db3737",
  color: props.color || "#fff",
  borderColor: props.borderColor || "#a82a2a",
}))`
  color: ${(props) => props.color};
  font-weight: bold;
  background: ${(props) => props.background};
  border: 1px solid ${(props) => props.borderColor};
  padding: 10px 30px;
  border-radius: 4px;
  outline: none;
  display: block;
  text-align: center;
  width: ${(props) => props.width};
  height: ${(props) => props.height};
  margin: ${(props) => props.margin};
  font-size: ${(props) => props.fontSize};
  font-family: var(--font-family);
`;

export default LinkButton;
