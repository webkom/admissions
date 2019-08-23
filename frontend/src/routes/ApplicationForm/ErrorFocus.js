import React from "react";
import { connect } from "formik";

class ErrorFocus extends React.Component {
  componentDidUpdate(prevProps) {
    const { isSubmitting, isValidating, errors } = prevProps.formik;
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
        errorElement.focus();
      }
    }
  }

  render() {
    return null;
  }
}

export default connect(ErrorFocus);
