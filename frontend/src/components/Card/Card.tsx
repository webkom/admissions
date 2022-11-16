import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

interface CardProps {
  margin?: string | number;
  padding?: string | number;
  width?: string | number;
  maxWidth?: string | number;
  primary?: boolean;
}

const Card = styled.div.attrs((props: CardProps) => ({
  margin: props.margin || "1rem",
  padding: props.padding || "1rem",
  width: props.width || "auto",
  "max-width": props.maxWidth || "auto",
}))<CardProps>`
  border: 1px solid rgba(0, 0, 0, 0.09);
  border-radius: 3px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);

  background: ${(props) => (props.primary ? "gray" : "white")};
  color: ${(props) => (props.primary ? "white" : "black")};

  margin: ${(props) => props.margin};
  padding: ${(props) => props.padding};
  width: ${(props) => props.width};
  max-width: ${(props) => props.maxWidth};

  ${media.handheld`
    margin: 0.3rem 0;
    padding: 0.5rem;
    `};
`;

export default Card;
