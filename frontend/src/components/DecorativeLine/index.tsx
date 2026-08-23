import styled from "styled-components";

interface DecorativeLineProps {
  $vertical?: boolean;
  $red?: boolean;
}

const DecorativeLine = styled.div<DecorativeLineProps>`
  display: block;
  background: ${(props) =>
    props.$red !== false ? "var(--lego-red-color)" : "var(--color-gray-3)"};
  width: ${(props) =>
    props.$vertical ? "var(--decorative-line-thickness)" : "auto"};
  height: ${(props) =>
    props.$vertical ? "auto" : "var(--decorative-line-thickness)"};
  min-height: ${(props) =>
    props.$vertical ? "var(--decorative-line-min-length)" : "0"};
  flex-shrink: 0;
  flex-grow: 0;
`;

export default DecorativeLine;
