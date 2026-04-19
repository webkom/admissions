import React, { Fragment, useState, useMemo } from "react";
import axios from "axios";
import { ScheduleTester } from "./ScheduleTester";
import cn from "src/utils/cn";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ScheduleTestingView({ candidates, interviewers }) {
  const [panelSize, setPanelSize] = useState(3);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("config");

  const [interviewerAvailability, setInterviewerAvailability] = useState(() => {
    const initial = {};
    interviewers.forEach((i) => {
      initial[i.id] = new Set();
    });
    return initial;
  });

  const [selectedInterviewer, setSelectedInterviewer] = useState(
    interviewers[0]?.id ?? null,
  );

  const slotsToAvailability = (slots) =>
    Array.from(slots).map((slot) => {
      const [day, hour] = slot.split("-").map(Number);
      return day * 24 + hour;
    });

  const handleSolve = async () => {
    if (candidates.length === 0 || interviewers.length === 0) {
      setError("You need at least one candidate and one interviewer.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const updatedInterviewers = interviewers.map((interviewer) => ({
        ...interviewer,
        availability: slotsToAvailability(
          interviewerAvailability[interviewer.id] || new Set(),
        ),
      }));

      const response = await axios.post("http://localhost:8000/solve", {
        candidates,
        interviewers: updatedInterviewers,
        panel_size: panelSize,
      });

      setResult(response.data);
      if (response.data.status === "SUCCESS") {
        setActiveTab("results");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to connect to the solver. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const scheduleByTime = useMemo(() => {
    if (!result?.schedule) return new Map();
    const map = new Map();
    result.schedule.forEach((item) => {
      const day = Math.floor(item.time / 24);
      const hour = item.time % 24;
      map.set(`${day}-${hour}`, item);
    });
    return map;
  }, [result]);

  const formatHour = (hour) => {
    const displayHour = hour % 12 || 12;
    return `${displayHour}${hour >= 12 ? "pm" : "am"}`;
  };

  return (
    <div className="rounded-panel border border-border bg-surface-base">
      <div className="flex items-center justify-between px-6 py-5">
        <div>
          <h1 className="m-0 text-title font-bold text-text-primary">
            Planleggings-optimaliserer
          </h1>
        </div>

        <div className="flex gap-6">
          <div className="text-center">
            <div className="text-title font-bold text-text-primary">
              {candidates.length}
            </div>
            <div className="text-label font-bold uppercase tracking-label text-text-subtle">
              Kandidater
            </div>
          </div>
          <div className="text-center">
            <div className="text-title font-bold text-text-primary">
              {interviewers.length}
            </div>
            <div className="text-label font-bold uppercase tracking-label text-text-subtle">
              Intervjuere
            </div>
          </div>
        </div>
      </div>

      <div className="flex border-b border-border px-6">
        {[
          ["config", "Oppsett"],
          ["results", "Resultat"],
          ["visual", "Timeline"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={cn(
              "cursor-pointer border-b-2 px-4 py-3 text-sm font-semibold transition-colors duration-100",
              activeTab === key
                ? "border-brand text-brand"
                : "border-transparent text-text-subtle hover:text-text-primary",
            )}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {activeTab === "config" && (
          <div className="grid gap-5 md:grid-cols-[260px_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-2 block text-label font-bold uppercase tracking-label text-text-subtle">
                  Antall intervjuere
                </label>
                <div className="flex flex-wrap gap-2">
                  {[2, 3, 4, 5].map((size) => (
                    <button
                      key={size}
                      type="button"
                      className={cn(
                        "cursor-pointer rounded-md border px-3 py-2 text-sm font-semibold transition-colors duration-100",
                        panelSize === size
                          ? "border-brand bg-brand text-text-white"
                          : "border-border-soft bg-surface-base text-text-primary hover:border-brand-strongBorder hover:bg-brand-soft",
                      )}
                      onClick={() => setPanelSize(size)}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="cursor-pointer rounded-lg border border-brand bg-brand px-4 py-2 text-ui font-bold text-text-white transition-[background,border-color] duration-150 hover:border-brand-hover hover:bg-brand-hover disabled:opacity-40"
                onClick={handleSolve}
                disabled={loading}
              >
                {loading ? "Prosesserer..." : "Lag plan"}
              </button>

              {error && (
                <div className="rounded-lg border border-brand-border bg-brand-muted px-4 py-3 text-sm font-semibold text-brand">
                  {error}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-surface-muted p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="m-0 text-sm font-bold text-text-primary">
                  Tilgjengelighet
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {interviewers.map((interviewer) => (
                    <button
                      key={interviewer.id}
                      type="button"
                      className={cn(
                        "cursor-pointer rounded-full border px-3 py-1.5 text-ui font-semibold transition-colors duration-100",
                        selectedInterviewer === interviewer.id
                          ? "border-brand-strongBorder bg-brand-tint text-brand"
                          : "border-border-soft bg-surface-base text-text-muted hover:border-brand-strongBorder hover:bg-brand-soft hover:text-text-primary",
                      )}
                      onClick={() => setSelectedInterviewer(interviewer.id)}
                    >
                      {interviewer.name}
                    </button>
                  ))}
                </div>
              </div>

              {selectedInterviewer && (
                <ScheduleTester
                  key={selectedInterviewer}
                  title={
                    interviewers.find((i) => i.id === selectedInterviewer)?.name
                  }
                  selectedSlots={interviewerAvailability[selectedInterviewer]}
                  onSlotsChange={(slots) => {
                    setInterviewerAvailability((prev) => ({
                      ...prev,
                      [selectedInterviewer]: slots,
                    }));
                  }}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === "results" && (
          <div className="rounded-lg border border-border bg-surface-muted p-4">
            {result?.status === "SUCCESS" ? (
              <div className="flex flex-col gap-2">
                {result.schedule
                  .slice()
                  .sort((a, b) => a.time - b.time)
                  .map((item, idx) => {
                    const dayIndex = Math.floor(item.time / 24);
                    const hour = item.time % 24;
                    const dayName = DAYS[dayIndex];

                    return (
                      <div
                        key={idx}
                        className="grid items-center gap-3 rounded-lg border border-border-soft bg-surface-base px-4 py-3 md:grid-cols-[100px_minmax(0,1fr)_minmax(0,2fr)]"
                      >
                        <div className="text-sm font-semibold text-text-muted">
                          {dayName} {hour}:00
                        </div>
                        <div className="text-sm font-semibold text-text-primary">
                          {item.candidate}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {item.panel.map((p, i) => (
                            <span
                              key={i}
                              className="rounded-full border border-border-soft bg-surface-subtle px-2 py-1 text-xs font-semibold text-text-body"
                            >
                              {typeof p === "string" ? p : p.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <div className="rounded-lg border border-border-soft bg-surface-base px-4 py-8 text-center text-sm font-semibold text-text-muted">
                No results generated
              </div>
            )}
          </div>
        )}

        {activeTab === "visual" && (
          <div className="rounded-lg border border-border bg-surface-muted p-4">
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[70px_repeat(7,minmax(90px,1fr))] gap-1.5">
                  <div className="text-label font-bold uppercase tracking-label text-text-subtle">
                    Time
                  </div>
                  {DAYS.map((d) => (
                    <div
                      key={d}
                      className="rounded-md border border-border-soft bg-surface-base py-2 text-center text-label font-bold uppercase tracking-label text-text-muted"
                    >
                      {d}
                    </div>
                  ))}

                  {Array.from({ length: 10 }, (_, i) => i + 8).map((hour) => (
                    <Fragment key={hour}>
                      <div
                        key={`label-${hour}`}
                        className="flex items-center justify-end pr-2 text-label font-bold uppercase tracking-label text-border-quiet"
                      >
                        {formatHour(hour)}
                      </div>
                      {DAYS.map((_, dayIdx) => {
                        const slot = scheduleByTime.get(`${dayIdx}-${hour}`);
                        return (
                          <div
                            key={`${dayIdx}-${hour}`}
                            className="min-h-[72px] rounded-md border border-border-soft bg-surface-base p-2"
                          >
                            {slot && (
                              <div className="rounded border border-brand-panelBorder bg-brand-subtle px-2 py-1.5">
                                <strong className="block truncate text-xs font-bold text-text-primary">
                                  {slot.candidate}
                                </strong>
                                <span className="text-[11px] text-text-muted">
                                  {slot.panel.length} interviewers
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ScheduleTestingView;
