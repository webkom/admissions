import React, { useState } from "react";
import styled from "styled-components";
import { CsvData } from "../EditGroup";
import {
  CSVExport,
  SectionCard,
  SectionDescription,
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
        <SectionTitle>Eksporter søknader</SectionTitle>
        {typeof rowCount === "number" && (
          <SectionDescription>
            {rowCount} rader er klare for nedlasting.
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
          Last ned CSV
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
  gap: var(--spacing-md);
  flex-wrap: wrap;
  padding: var(--spacing-md);
`;

const FormatSelector = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  min-width: var(--control-min-width);

  label {
    color: var(--color-text-muted);
    font-size: var(--font-size-sm);
    font-weight: 600;
  }
`;

const ControlRow = styled.div`
  display: flex;
  align-items: flex-end;
  gap: var(--spacing-xl);
  flex-wrap: wrap;
`;
