import styled from "styled-components";
import { Link } from "react-router-dom";

const LinkButton = styled(Link).attrs({
  width: props => props.width || "auto",
  height: props => props.height || "auto",
  margin: props => props.margin || "0",
  fontSize: props => props.fontSize || "1.1em",
  background: props => props.background || "#db3737",
  color: props => props.color || "#fff",
  bordercolor: props => props.bordercolor || "#a82a2a"
})`
  color: ${props => props.color};
  font-weight: bold;
  background: ${props => props.background};
  border: 1px solid ${props => props.bordercolor};
  padding: 10px 30px;
  border-radius: 4px;
  outline: none;
  display: block;
  text-align: center;
  width: ${props => props.width};
  height: ${props => props.height};
  margin: ${props => props.margin};
  font-size: ${props => props.fontSize};
  font-family: Raleway;
`;

export default LinkButton;
