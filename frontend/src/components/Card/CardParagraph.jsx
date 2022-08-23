import styled from "styled-components";

const CardParagraph = styled.p.attrs((props) => ({
  fontSize: props.fontSize || "1em",
  margin: props.margin || "1rem 1.5rem",
  lineheight: props.lineheight || "",
}))`
  margin: ${(props) => props.margin};
  font-size: ${(props) => props.fontSize};
  line-height: ${(props) => props.lineheight};
`;

export default CardParagraph;
