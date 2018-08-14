import Button from "src/components/Button";

const SubmitButton = Button.extend`
  background: ${props => (props.valid ? "#db3737" : "gray")};
  border: 1px solid ${props => (props.valid ? "#a82a2a" : "darkgray")};

  &:active {
    opacity: 0.9;
  }
`;

export default SubmitButton;
