import React from "react";
import { createRoot } from "react-dom/client";

import AdmissionDateTimePicker from "../../../frontend/src/routes/ManageAdmissions/components/AdmissionDateTimePicker";
import "../../../frontend/src/styles/globals.css";
import "../../../frontend/src/styles/scheduler.css";

const search = new URLSearchParams(window.location.search);
const initialValue = search.get("value") ?? "2026-07-17T13:12:00";
const placeholder = search.get("placeholder") ?? "2026-07-20T12:00:00";
const minimum = search.get("min") ?? undefined;
const preservedValue = search.get("preserved") ?? undefined;
const preservedMinimum = search.get("preservedMin") ?? undefined;
const minimumIsExclusive = search.get("exclusive") === "1";
const verticalOffset = Number(search.get("offset") ?? "0");

const AdmissionDateTimePickerHarness: React.FC = () => {
  const [value, setValue] = React.useState(initialValue);
  const [blurCount, setBlurCount] = React.useState(0);

  return (
    <main
      data-cy="datetime-harness"
      style={{
        maxWidth: 560,
        padding: 40,
        transform: `translateY(${verticalOffset}px)`,
      }}
    >
      <label
        htmlFor="open_from"
        style={{ display: "block", marginBottom: 8, fontWeight: 700 }}
      >
        Opptaket åpner
      </label>
      <span
        id="timezone-description"
        style={{ display: "block", marginBottom: 8 }}
      >
        Alle tider vises i norsk tid.
      </span>
      <span
        id="open_from-description"
        style={{ display: "block", marginBottom: 8 }}
      >
        Når søknadsperioden skal starte.
      </span>
      <AdmissionDateTimePicker
        id="open_from"
        label="Opptaket åpner"
        value={value}
        placeholder={placeholder}
        min={minimum}
        preservedValue={preservedValue}
        preservedMin={preservedMinimum}
        minExclusive={minimumIsExclusive}
        describedBy="open_from-description"
        onChange={setValue}
        onBlur={() => setBlurCount((count) => count + 1)}
      />
      <output data-cy="committed-datetime" hidden>
        {value}
      </output>
      <output data-cy="blur-count" hidden>
        {blurCount}
      </output>
    </main>
  );
};

const root = document.getElementById("root");
if (!root) throw new Error("Admission date-time fixture root is missing");
createRoot(root).render(<AdmissionDateTimePickerHarness />);
