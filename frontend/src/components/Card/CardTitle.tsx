import styled from "styled-components";

interface CardTitleProps {
  fontSize: string | number;
  margin: string | number;
}

const CardTitle = styled.h1.attrs((props: CardTitleProps) => ({
  fontSize: props.fontSize || "1.5em",
  margin: props.margin || "1rem 1.5rem",
}))`
  margin: ${(props) => props.margin};
  font-size: ${(props) => props.fontSize};
  line-height: 1.4em;
`;

export default CardTitle;
