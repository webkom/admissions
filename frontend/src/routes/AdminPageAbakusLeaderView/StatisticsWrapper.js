import styled from "styled-components";

const SmallDescriptionWrapper = styled.div`
  display: inline-flex;
  flex-direction: column;
  margin: ${props => (props.smallerMargin ? "0 0.5em 1em 1em" : "1em")};

  justify-content: flex-start;
  line-height: 1;
  align-items: center;
`;

export default SmallDescriptionWrapper;
