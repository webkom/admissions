import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import Button from "src/components/Button";
import PageTitle from "src/components/PageTitle";

/*
 * Wrapper for content;
 */

export const Wrapper = styled.div`
  width: 70%;
  margin: auto;
  ${media.handheld`
     width: 100%;
  `};
`;

/*
 * Subtitle
 */

export const SubTitle = PageTitle.extend`
  font-size: 2rem;
  margin-bottom: 1em;
  color: gray;
  font-weight: normal;
`;

/*
 * Submit button
 */

export const SubmitButton = Button.extend`
  background: ${props => (props.valid ? "#db3737" : "gray")};
  border: 1px solid ${props => (props.valid ? "#a82a2a" : "darkgray")};
  margin: 0 auto 3em auto;

  &:active {
    opacity: 0.9;
  }
`;

/*
 * No chosen committees text
 */

export const NoChosenCommittees = styled.span`
  font-size: 2rem;
  font-family: Raleway, "Helvetica Neue", Arial, sans-serif;
  color: gray;
  text-align: center;
  display: block;
  margin-top: 2em;
`;

/*
 * No chosen committees text
 */

export const NoChosenCommitteesSmallInfo = styled.span`
  font-size: 1.3rem;
  font-family: Raleway, "Helvetica Neue", Arial, sans-serif;
  color: gray;
  text-align: center;
  display: block;
  padding-bottom: 2em;
`;

/*
 * ToggleCommitteeWrapper
 */

export const ToggleCommitteeWrapper = styled.div`
  display: flex;
  flex-wrap: wrap;
  margin: 2em 8em;
`;
