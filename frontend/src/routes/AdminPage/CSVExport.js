import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import { CSVLink } from "react-csv";

const CSVExport = styled(CSVLink)`
  margin: 0.5em;
  display: block;
  text-align: center;
`;

export default CSVExport;
