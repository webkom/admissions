import React, { useState } from "react";
import styled from "styled-components";
import { CsvData } from "../EditGroup";
import { CSVExport } from "./StyledElements";

export type CompleteCsvData = {
  priorityText: string;
  group: string;
  groupApplicationText: string;
} & Omit<CsvData, "applicationText">;

const csvFormats = [
  { name: "Google Sheets", separator: ",", enclosingCharacter: '"' },
  { name: "Excel (norsk)", separator: ";", enclosingCharacter: '"' },
];

type Props = {
  csvData: CompleteCsvData[];
  csvHeaders: { label: string; key: string }[];
};

const CSVExportHandler: React.FC<Props> = ({ csvData, csvHeaders }) => {
  const [csvFormat, setCsvFormat] = useState(csvFormats[0]);

  return (
    <Wrapper>
      <FormatSelector>
        <label htmlFor={"csv-selector"}>Velg CSV-format</label>
        <select
          id={"csv-selector"}
          onChange={(event) =>
            setCsvFormat(
              csvFormats.find(
                (csvFormat) => csvFormat.name === event.target.value
              ) ?? csvFormats[0]
            )
          }
        >
          {csvFormats.map((csvFormat) => (
            <option key={csvFormat.name} value={csvFormat.name}>
              {csvFormat.name}
            </option>
          ))}
        </select>
      </FormatSelector>
      <CSVExport
        data={csvData}
        headers={csvHeaders}
        filename={"applications.csv"}
        target="_blank"
        separator={csvFormat.separator}
        enclosingCharacter={csvFormat.enclosingCharacter}
      >
        Eksporter som csv
      </CSVExport>
    </Wrapper>
  );
};

export default CSVExportHandler;

const Wrapper = styled.div`
  display: flex;
  width: 100%;
`;

const FormatSelector = styled.div`
  display: flex;
  flex-direction: column;
  flex-basis: 200px;
  padding: 0 10px;
  border-top: 5px solid rgb(192, 57, 43);
  border-bottom: 1px solid rgb(192, 57, 43);
`;
