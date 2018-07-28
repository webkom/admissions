import { css } from "styled-components";

export const media = {
  handheld: (...args) => css`
    @media screen and (max-width: 415px) {
      ${css(...args)};
    }
  `
};
