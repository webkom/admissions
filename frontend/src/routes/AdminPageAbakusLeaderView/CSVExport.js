import styled from "styled-components";
import { media } from "src/styles/mediaQueries";
import { CSVLink } from "react-csv";

const CSVExport = styled(CSVLink)`
  padding: 1em 0;
  display: block;
  text-align: center;
  border-top: 5px solid #c0392b;
  border-bottom: 1px solid #c0392b;
  width: 100%;
  font-weight: bold;
`;

export default CSVExport;
