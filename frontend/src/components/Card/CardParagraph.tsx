import styled from "styled-components";

interface CardParagraphProps {
  fontSize: string | number;
  margin: string | number;
  lineHeight: string | number;
}

const CardParagraph = styled.p.attrs((props: CardParagraphProps) => ({
  fontSize: props.fontSize || "1em",
  margin: props.margin || "1rem 1.5rem",
  lineHeight: props.lineHeight || "",
}))`
  margin: ${(props) => props.margin};
  font-size: ${(props) => props.fontSize};
  line-height: ${(props) => props.lineHeight};
`;

export default CardParagraph;
