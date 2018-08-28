import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import LinkButton from "src/components/LinkButton";

export const Wrapper = styled.div`
  padding: 20px;
  display: grid;
  grid-template-columns: 5fr 1fr;
  grid-template-rows: auto;
  grid-template-areas:
    "appHeader logo"
    "appContent appContent";
  ${media.handheld`
     `};
`;
export const Image = styled.img`
  height: 5em;
  width: 5em;
  margin: 1em;
  display: grip;
  align-self: center;
  justify-self: center;
`;

export const HeaderWrapper = styled.div`
  max-width: 550px;
  padding: 20px;
  display: grid;
  grid-template-columns: auto;
  grid-template-rows: auto;
  grid-template-areas:
    "HeaderText"
    "TimeStamp"
    "Phone"
    "Button";
`;

export const AppHeader = styled.div`
  display: grid;
  font-weight: bold;
  font-size: 2em;
  grid-area: appHeader;
  align-self: center;
  justify-self: left;
`;

export const HeaderText = styled.div`
  grid-area: HeaderText;
  text-align: center;
  font-size: 2em;
  font-weight: bold;
`;

export const TimeStamp = styled.div`
  color: ${props => (props.deadline ? "green" : "red")};
  grid-area: TimeStamp;
  text-align: center;
  margin-top: -1em;
  font-style: italic;
`;

export const Phone = styled.div`
  grid-area: Phone;
  text-align: center;
`;

export const ChangeButton = styled(LinkButton)`
  grid-area: Button;
  width: 50%;
  justify-self: center;
`;

export const DeleteButton = styled.div`
  font-size: 1em;
  justify-self: center;
  cursor: pointer;
  font-family: Raleway, "Helvetica Neue" ,Arial, sans-serif;
  color: gray;
  font-weight: bold;

  &:hover {
    text-shadow: 0.5px 0.5px darkgray;
  }
`;

export const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const List = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 800px;
`;
