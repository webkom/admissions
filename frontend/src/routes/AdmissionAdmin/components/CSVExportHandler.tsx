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
import { CustomSelect } from "src/components/ui";

export type CompleteCsvData = {
  priorityText: string;
  group: string;
  groupApplicationText: string;
} & Omit<CsvData, "applicationText"> &
  Record<string, string | boolean | null | undefined>;

const csvFormats = [
  { name: "Google Sheets", separator: ",", enclosingCharacter: '"' },
  { name: "Excel (norsk)", separator: ";", enclosingCharacter: '"' },
];

type Props = {
  csvData: CompleteCsvData[];
  csvHeaders: { label: string; key: string }[];
  rowCount?: number;
};

const CSVExportHandler: React.FC<Props> = ({
  csvData,
  csvHeaders,
  rowCount,
}) => {
  const [csvFormat, setCsvFormat] = useState(csvFormats[0]);

  return (
    <Wrapper>
      <div>
        <SectionEyebrow>Eksport</SectionEyebrow>
        <SectionTitle>applications.csv</SectionTitle>
        {typeof rowCount === "number" && (
          <SectionDescription>
            {rowCount} rader i forhåndsvisningen
          </SectionDescription>
        )}
      </div>

      <ControlRow>
        <FormatSelector>
          <label htmlFor="csv-selector">CSV-format</label>
          <CustomSelect
            id="csv-selector"
            value={csvFormat.name}
            onChange={(value) =>
              setCsvFormat(
                csvFormats.find((f) => f.name === value) ?? csvFormats[0],
              )
            }
            options={csvFormats.map((f) => ({ value: f.name, label: f.name }))}
          />
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
  padding: 0.85rem 1rem;
  border-radius: 8px;
`;

const FormatSelector = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 220px;

  label {
    color: #6b7280;
    font-size: 0.82rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
`;

const ControlRow = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 0.85rem;
  flex-wrap: wrap;
`;
