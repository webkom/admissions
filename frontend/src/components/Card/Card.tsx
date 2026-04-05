import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

interface CardProps {
  margin?: string | number;
  padding?: string | number;
  width?: string | number;
  maxWidth?: string | number;
  primary?: boolean;
}

const Card = styled.div<CardProps>`
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: var(--border-radius-md);
  box-shadow: var(--shadow-sm);
  transition: var(--transition-base);

  background: ${(props) =>
    props.primary ? "var(--lego-red-color, #e11d48)" : "white"};
  color: ${(props) => (props.primary ? "white" : "inherit")};

  margin: ${(props) => props.margin || "1rem"};
  padding: ${(props) => props.padding || "2rem"};
  width: ${(props) => props.width || "auto"};
  max-width: ${(props) => props.maxWidth || "auto"};

  &:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }

  ${media.handheld`
    margin: 0.5rem 0;
    padding: 1.25rem;
    border-radius: var(--border-radius-sm);
  `};
`;

export default Card;
