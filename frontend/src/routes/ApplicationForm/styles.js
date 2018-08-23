import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import Button from "src/components/Button";
import { Field } from "formik";

/*
 * The wrapper that makes the toggle committees stay on the right on scrolling
 */

export const Wrapper = styled.div`
  width: 70%;
  ${media.handheld`
     width: 100%;
  `};
`;

/*
 * Phone number field
 */

export const PhoneNumberField = styled(Field)`
  font-size: 1em;
`;

/*
 * Submit button
 */

export const SubmitButton = Button.extend`
  background: ${props => (props.valid ? "#db3737" : "gray")};
  border: 1px solid ${props => (props.valid ? "#a82a2a" : "darkgray")};
  grid-area: button;
  margin: 0 auto 3em auto;

  &:active {
    opacity: 0.9;
  }
`;

/*
 * Subtitle
 */

export const PageSubTitle = styled.h2`
  font-size: 2rem;
  margin: 0.6em 0;
  line-height: 1.2em;
  color: gray;
  font-size: 2rem;

  ${media.handheld`
    text-align: center;
    margin: 0.3em;
    font-size: 1.5rem;
    `};
`;

/*
 * ToggleCommitteeWrapper
 */

export const ToggleCommitteeWrapper = styled.div`
  position: fixed;
  top: 11em;
  left: 90%;
  transform: translateX(-90%);
  ${media.handheld`
     position: relative;
     top: auto;
     left: auto;
  `};
`;
