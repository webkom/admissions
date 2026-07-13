import React, { useMemo, useState } from "react";
import styled from "styled-components";
import { CsvData } from "../EditGroup";
import {
  CSVExport,
  SectionCard,
  SectionDescription,
  SectionTitle,
} from "./StyledElements";
import { CustomSelect } from "src/components/ui";
import { escapeCsvCell } from "src/utils/methods";

export type CompleteCsvData = {
  priorityText: string;
  group: string;
  groupApplicationText: string;
  appliedWithinDeadline: string;
  createdAt: string;
  updatedAt: string;
} & Omit<
  CsvData,
  "applicationText" | "appliedWithinDeadline" | "createdAt" | "updatedAt"
> &
  Record<string, string | boolean | null | undefined>;

const csvFormats = [
  { name: "Google Sheets", separator: ",", enclosingCharacter: '"' },
  { name: "Excel (norsk)", separator: ";", enclosingCharacter: '"' },
];

type Props = {
  csvData: CompleteCsvData[];
  csvHeaders: { label: string; key: string }[];
  rowCount?: number;
  filename: string;
};

const CSVExportHandler: React.FC<Props> = ({
  csvData,
  csvHeaders,
  rowCount,
  filename,
}) => {
  const [csvFormat, setCsvFormat] = useState(csvFormats[0]);
  const [selectedColumns, setSelectedColumns] = useState(() =>
    csvHeaders.map((header) => header.key),
  );
  const selectedHeaders = useMemo(
    () => csvHeaders.filter((header) => selectedColumns.includes(header.key)),
    [csvHeaders, selectedColumns],
  );
  const downloadHeaders = useMemo(
    () =>
      selectedHeaders.map((header) => ({
        ...header,
        label: escapeCsvCell(header.label),
      })),
    [selectedHeaders],
  );
  const canDownload = csvData.length > 0 && selectedHeaders.length > 0;

  const toggleColumn = (key: string) =>
    setSelectedColumns((current) =>
      current.includes(key)
        ? current.filter((column) => column !== key)
        : [...current, key],
    );

  return (
    <Wrapper>
      <div>
        <SectionTitle>Eksporter søknader</SectionTitle>
        {typeof rowCount === "number" && (
          <SectionDescription>
            {rowCount} rader er klare for nedlasting.
          </SectionDescription>
        )}
        <PrivacyNotice>
          Filen inneholder personopplysninger. Velg bare kolonnene du trenger,
          og slett filen når opptaket er ferdig.
        </PrivacyNotice>
      </div>

      <ControlRow>
        <ColumnSelector>
          <summary>
            Velg kolonner ({selectedHeaders.length} av {csvHeaders.length})
          </summary>
          <ColumnOptions>
            {csvHeaders.map((header) => (
              <label key={header.key}>
                <input
                  type="checkbox"
                  checked={selectedColumns.includes(header.key)}
                  onChange={() => toggleColumn(header.key)}
                />
                {header.label}
              </label>
            ))}
          </ColumnOptions>
        </ColumnSelector>
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
        {canDownload ? (
          <CSVExport
            data={csvData}
            headers={downloadHeaders}
            filename={filename}
            separator={csvFormat.separator}
            enclosingCharacter={csvFormat.enclosingCharacter}
          >
            Last ned CSV
          </CSVExport>
        ) : (
          <DisabledExport aria-disabled="true">
            Ingen rader å laste ned
          </DisabledExport>
        )}
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

const PrivacyNotice = styled(SectionDescription)`
  max-width: var(--content-width-compact);
`;

const ColumnSelector = styled.details`
  min-width: var(--control-min-width);
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);

  summary {
    min-height: var(--control-height-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border: var(--border-width-default) solid var(--color-border-muted);
    border-radius: var(--border-radius-md);
    background: var(--color-surface-base);
    cursor: pointer;
    font-weight: 600;
  }
`;

const ColumnOptions = styled.div`
  display: grid;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
  padding: var(--spacing-md);
  border: var(--border-width-default) solid var(--color-border-soft);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-base);

  label {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }
`;

const ControlRow = styled.div`
  display: flex;
  align-items: flex-end;
  gap: var(--spacing-xl);
  flex-wrap: wrap;
`;

const DisabledExport = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--control-height-sm);
  padding: 0 var(--spacing-xl);
  border: var(--border-width-emphasis) solid var(--color-border-muted);
  border-radius: var(--border-radius-pill);
  background: var(--color-surface-disabled);
  color: var(--color-text-disabled);
  font-size: var(--font-size-sm);
  font-weight: 600;
`;
