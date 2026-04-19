import React, { useState } from "react";
import styled from "styled-components";
import { CsvData } from "../EditGroup";
import {
  CSVExport,
  SectionCard,
  SectionDescription,
  SectionEyebrow,
  SectionTitle,
} from "./StyledElements";

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
      <div>
        <SectionEyebrow>Eksport</SectionEyebrow>
        <SectionTitle>Last ned søknadene som CSV</SectionTitle>
        <SectionDescription>
          Velg formatet som passer regnearket du skal åpne filen i.
        </SectionDescription>
      </div>

      <ControlRow>
        <FormatSelector>
          <label htmlFor={"csv-selector"}>CSV-format</label>
          <select
            id={"csv-selector"}
            onChange={(event) =>
              setCsvFormat(
                csvFormats.find(
                  (csvFormat) => csvFormat.name === event.target.value,
                ) ?? csvFormats[0],
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
          Eksporter som CSV
        </CSVExport>
      </ControlRow>
    </Wrapper>
  );
};

export default CSVExportHandler;

const Wrapper = styled(SectionCard)`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
`;

const FormatSelector = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.45rem;

  label {
    color: #6b7280;
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  select {
    min-width: 220px;
    min-height: 3rem;
    padding: 0 0.95rem;
    border-radius: 0.75rem;
    border: 1px solid #d1d5db;
    background: #fff;
    color: #1f2937;
    font: inherit;
  }
`;

const ControlRow = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 0.85rem;
  flex-wrap: wrap;
`;
