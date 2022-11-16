import React from "react";
import { connect, FormikContextType, FormikValues } from "formik";

interface ErrorFocusProps {
  formik: FormikContextType<FormikValues>;
}

class ErrorFocus extends React.Component<ErrorFocusProps> {
  componentDidUpdate({ formik }: ErrorFocusProps) {
    const { isSubmitting, isValidating, errors } = formik;
    const keys = Object.keys(errors);
    keys.sort();

    if (keys.length > 0 && isSubmitting && !isValidating) {
      let selector, errorElement;
      if (keys.includes("phoneNumber")) {
        selector = `[name="phoneNumber"]`;
        errorElement = document.querySelector(selector);
      } else {
        selector = `[name="${keys[0]}"]`;
        errorElement = document.querySelector(selector);
      }
      if (errorElement) {
        (errorElement as HTMLElement).focus();
      }
    }
  }

  render() {
    return null;
  }
}

export default connect((props) => <ErrorFocus formik={props.formik} />);
