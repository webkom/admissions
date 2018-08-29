import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import Button from "src/components/Button";
import { Card } from "src/components/Card";
import { Link } from "react-router-dom";
import { CSVLink } from "react-csv";

export const Wrapper = styled(Card)`
  width: 50em;
  min-height: 10em;
  padding: 0;

  ${media.handheld`
     width: 100%;
  `};
`;

export const SubmitButton = Button.extend`
  background: ${props => (props.valid ? "#db3737" : "gray")};
  border: 1px solid ${props => (props.valid ? "#a82a2a" : "darkgray")};
  width: 10em;

  &:active {
    opacity: 0.9;
  }
`;

export const FormWrapper = styled.div`
  padding: 1em 2em;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
  ${media.handheld`
     padding: 1em;
  `};
`;

export const CommitteeLogo = styled.img`
  object-fit: scale-down;
  max-height: 2em;
  margin-right: 0.5em;
`;

export const CommitteeLogoWrapper = styled.div`
  display: flex;
  align-items: center;
`;

export const EditCommitteeFormWrapper = styled.div`
  display: flex;
  width: 100%;

  div {
    flex: 1 1 100%;
    margin: 0 0.5em;
  }

  ${media.handheld`
    flex-wrap: wrap;
  `};
`;

export const LinkLink = styled(Link)`
  padding: 1em 0;
  display: block;
  font-weight: bold;
`;

export const CSVExport = styled(CSVLink)`
  padding: 1em 0;
  display: block;
  text-align: center;
  border-top: 5px solid #c0392b;
  border-bottom: 1px solid #c0392b;
  width: 100%;
  font-weight: bold;
`;

/*
 * Statistics
 */

export const Statistics = styled.div`
  padding: 0.5em;
  display: flex;
  justify-content: center;
  width: 100%;
  flex-wrap: wrap;
`;

export const StatisticsWrapper = styled.div`
  display: inline-flex;
  flex-direction: column;
  margin: ${props => (props.smallerMargin ? "0 0.5em 1em 1em" : "1em")};

  justify-content: flex-start;
  line-height: 1;
  align-items: center;
`;

export const StatisticsName = styled.span`
  font-size: 0.8em;
  font-weight: bold;
  text-transform: ${props => (props.capitalize ? "capitalize" : "normal")};
`;
