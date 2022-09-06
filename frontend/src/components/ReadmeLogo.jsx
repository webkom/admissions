import React from "react";

const readmeIfy = (text) =>
  text && <span>{text.replaceAll("PR-revy", "PR")}</span>;

export default readmeIfy;
