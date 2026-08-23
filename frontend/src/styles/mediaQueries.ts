import { css } from "styled-components";
import { breakpoints } from "./designTokens";

export const media = {
  handheld: (...args: [TemplateStringsArray]) => css`
    @media screen and (max-width: ${breakpoints.phone}) {
      ${css(...args)};
    }
  `,
  portrait: (...args: [TemplateStringsArray]) => css`
    @media screen and (max-width: ${breakpoints.tablet}) {
      ${css(...args)};
    }
  `,
};
