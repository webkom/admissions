import React, { useMemo, useState } from "react";
import styled from "styled-components";
import { Download, FileDown, Info } from "lucide-react";
import { CsvData } from "../EditGroup";
import { CSVExport, SectionDescription, SectionTitle } from "./StyledElements";
import { CustomSelect, MultiSelect } from "src/components/ui";
import { escapeCsvCell } from "src/utils/methods";
import { media } from "src/styles/mediaQueries";
import { iconSizes } from "src/styles/designTokens";

export type CompleteCsvData = {
  group: string;
  groupApplicationText: string;
  priorityText: string;
  appliedWithinDeadline: string;
  createdAt: string;
  updatedAt: string;
} & Omit<
  CsvData,
  "applicationText" | "appliedWithinDeadline" | "createdAt" | "updatedAt"
> &
  Record<string, string | boolean | null | undefined>;

const csvFormats = [
  {
    name: "Google Sheets",
    separator: ",",
    enclosingCharacter: '"',
  },
  {
    name: "Excel (norsk)",
    separator: ";",
    enclosingCharacter: '"',
  },
];

type Props = {
  csvData: CompleteCsvData[];
  csvHeaders: { label: string; key: string }[];
  filename: string;
};

const CSVExportHandler: React.FC<Props> = ({
  csvData,
  csvHeaders,
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
  const disabledExportLabel =
    selectedHeaders.length === 0
      ? "Velg minst én kolonne"
      : "Ingen rader å laste ned";

  return (
    <Wrapper>
      <ExportIntro>
        <ExportIcon aria-hidden="true">
          <FileDown size={iconSizes.standard} />
        </ExportIcon>
        <div>
          <SectionTitle>Eksporter søknader</SectionTitle>
          <PrivacyNotice>
            Inneholder personopplysninger.{" "}
            <b className="font-extrabold"> Slett filen etter opptaket!</b>
          </PrivacyNotice>
        </div>
      </ExportIntro>

      <ControlRow>
        <ControlField>
          <ControlLabel>Kolonner</ControlLabel>
          <MultiSelect
            id="csv-columns-selector"
            values={selectedColumns}
            onChange={setSelectedColumns}
            options={csvHeaders.map((header) => ({
              value: header.key,
              label: header.label,
            }))}
            getSelectionLabel={(selected, options) =>
              `${selected.length} av ${options.length} valgt`
            }
            selectAllLabel="Velg alle"
            clearAllLabel="Fjern alle"
            aria-label="Velg CSV-kolonner"
          />
        </ControlField>
        <FormatSelector>
          <FormatLabel>
            <span>Format</span>
            <FormatHelp>
              <button
                type="button"
                aria-label="Forklaring av CSV-format"
                aria-describedby="csv-format-help"
              >
                <Info size={iconSizes.compact} aria-hidden="true" />
              </button>
              <span id="csv-format-help" role="tooltip">
                Google Sheets bruker komma (,). Excel (norsk) bruker semikolon
                (;).
              </span>
            </FormatHelp>
          </FormatLabel>
          <CustomSelect
            id="csv-selector"
            value={csvFormat.name}
            onChange={(value) =>
              setCsvFormat(
                csvFormats.find((f) => f.name === value) ?? csvFormats[0],
              )
            }
            options={csvFormats.map((f) => ({ value: f.name, label: f.name }))}
            aria-describedby="csv-format-help"
          />
        </FormatSelector>
        {canDownload ? (
          <DownloadExport
            data={csvData}
            headers={downloadHeaders}
            filename={filename}
            separator={csvFormat.separator}
            enclosingCharacter={csvFormat.enclosingCharacter}
          >
            <Download size={iconSizes.control} aria-hidden="true" />
            Last ned
          </DownloadExport>
        ) : (
          <DisabledExport aria-disabled="true">
            {disabledExportLabel}
          </DisabledExport>
        )}
      </ControlRow>
    </Wrapper>
  );
};

export default CSVExportHandler;

const Wrapper = styled.section`
  display: grid;
  grid-template-columns: minmax(18rem, 1fr) auto;
  align-items: center;
  gap: var(--spacing-xl);
  padding: var(--spacing-lg) 0;
  border-top: var(--border-width-default) solid var(--color-border-soft);
  border-bottom: var(--border-width-default) solid var(--color-border-soft);

  ${media.portrait`
    grid-template-columns: 1fr;
    align-items: stretch;
    gap: var(--spacing-lg);
  `}
`;

const ExportIntro = styled.div`
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-md);
  min-width: 0;
`;

const ExportIcon = styled.span`
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: var(--control-height-sm);
  height: var(--control-height-sm);
  border-radius: var(--border-radius-md);
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
`;

const FormatSelector = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  width: 11rem;
`;

const FormatLabel = styled.div`
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
`;

const FormatHelp = styled.span`
  position: relative;
  display: inline-flex;

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--color-text-muted);
    cursor: help;

    &:hover,
    &:focus-visible {
      color: var(--color-brand);
      outline: none;
    }

    &:focus-visible {
      box-shadow: 0 0 0 3px var(--color-brand-ring-soft);
    }
  }

  > span {
    position: absolute;
    z-index: var(--popover-layer);
    top: calc(100% + var(--spacing-sm));
    left: 50%;
    width: 15rem;
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--border-radius-md);
    background: var(--color-text-primary);
    color: var(--color-surface-base);
    font-size: var(--font-size-detail);
    font-weight: var(--font-weight-medium);
    line-height: var(--line-height-base);
    opacity: 0;
    pointer-events: none;
    transform: translateX(-50%) translateY(-0.125rem);
    transition:
      opacity var(--easing-fast),
      transform var(--easing-fast);
  }

  button:hover + span,
  button:focus-visible + span {
    opacity: 1;
    transform: translateX(-50%);
  }
`;

const PrivacyNotice = styled(SectionDescription)`
  margin-top: var(--spacing-xs);
  max-width: 25rem;
`;

const ControlField = styled.div`
  width: 13rem;
`;

const ControlLabel = styled.span`
  display: block;
  margin-bottom: var(--spacing-xs);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
`;

const ControlRow = styled.div`
  display: grid;
  grid-template-columns: 13rem 11rem 12rem;
  align-items: flex-end;
  gap: var(--spacing-md);

  ${media.portrait`
    grid-template-columns: 1fr;
    width: 100%;

    > * {
      width: 100%;
    }
  `}
`;

const DownloadExport = styled(CSVExport)`
  width: 12rem;
`;

const DisabledExport = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--control-height-md);
  width: 12rem;
  padding: 0 var(--spacing-md);
  border: var(--border-width-emphasis) solid var(--color-border-muted);
  border-radius: var(--border-radius-pill);
  background: var(--color-surface-disabled);
  color: var(--color-text-disabled);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
`;
