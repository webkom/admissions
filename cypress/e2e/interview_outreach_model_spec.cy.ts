import {
  createDefaultInterviewOutreachTemplates,
  findUnknownInterviewOutreachTokens,
  normalizeStoredOutreachTemplates,
  renderInterviewOutreachTemplate,
} from "../../frontend/src/routes/SchedulePage/interviewOutreach";

const outreachValues = {
  candidateFullName: "Ada Lovelace",
  admissionTitle: "Webkom-opptaket",
  timeLabel: "mandag 18:00",
  committee: "Webkom",
};

describe("interview outreach template model", () => {
  it("does not invent a room or other logistics in the default message", () => {
    const template = createDefaultInterviewOutreachTemplates("Webkom").sms.body;
    const rendered = renderInterviewOutreachTemplate(template, outreachValues);

    expect(rendered).to.contain("Ada");
    expect(rendered).to.contain("Webkom");
    expect(rendered).to.contain("mandag 18:00");
    expect(rendered).not.to.match(/\brom\b/iu);
  });

  it("migrates and renders supported legacy variables without leaking tokens", () => {
    const legacy =
      "Hei {navn}! {opptak}: intervju med {panel} {tid}. Svar i {kanal}.";
    const normalized = normalizeStoredOutreachTemplates(legacy, "Webkom");
    const rendered = renderInterviewOutreachTemplate(
      normalized.sms.body,
      outreachValues,
    );

    expect(findUnknownInterviewOutreachTokens(legacy)).to.deep.equal([]);
    expect(rendered).to.equal(
      "Hei Ada Lovelace! Webkom-opptaket: intervju med Webkom mandag 18:00. Svar i denne meldingen.",
    );
  });
});
