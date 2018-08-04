import { css } from "styled-components";

export const media = {
  handheld: (...args) => css`
    @media screen and (max-width: 500px) {
      ${css(...args)};
    }
  `,
  portrait: (...args) => css`
    @media screen and (max-width: 1000px) {
      ${css(...args)};
    }
  `
};
