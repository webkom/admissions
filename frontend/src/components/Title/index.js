import styled from "styled-components";
import { media } from "src/styles/mediaQueries";

/*
 * Default Title componenet
 * 
 * FORMAT
 *     porps: "action" (DEFAULT)
 *
 * size: font size for the title (3rem)
 * color: color for the title (black)
 * margin: margin for title (1em)
 * lineHeight: line-heigth for the title (1.2em)
 *
 * portrait: font size for portrait mode (2.5rem)
 * portMargin: margin for portrait title (1em)
 * 
 * handheld: font size for handheld title (1.5rem)
 * handMargin: margin for handheld title (1em)
 * 
 */

const Title = styled.h1`
  font-size: ${props => (props.size == null ? "3rem" : props.size)};
  color: ${props => (props.color == null ? "black" : props.color)};
  margin: ${props => (props.margin == null ? "1em 1em 1em 1em" : props.margin)};
  line-height: ${props =>
    props.lineHeight == null ? "1.2em" : props.lineHeight};
  text-align: center;

  ${media.portrait`
    font-size: ${props => (props.portrait == null ? "2.5rem" : props.portrait)};
    margin: ${props =>
      props.portMargin == null ? "1em 1em 1em 1em" : props.portMargin};
  `};

  ${media.handheld`
    font-size: ${props => (props.handheld == null ? "1.5rem" : props.handheld)};
    margin: ${props =>
      props.handMargin == null ? "1em 1em 1em 1em" : props.handMargin};
  `};
`;

export default Title;
