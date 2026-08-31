import { derivePanelDiffView } from "../../frontend/src/components/Scheduling/panelDiffModel";
import type { SchedulePanelMember } from "../../frontend/src/types";

const member = (name: string, id: string): SchedulePanelMember => ({
  name,
  id,
  is_overtime: false,
});

const ANNA = member("Anna Berg", "anna");
const BJORN = member("Bjørn Dahl", "bjorn");
const CARL = member("Carl Eng", "carl");

const isAnna = (m: SchedulePanelMember) => m.id === "anna";

const view = (
  baseline: SchedulePanelMember[] | null,
  panel: SchedulePanelMember[],
  isCurrentUser?: (m: SchedulePanelMember) => boolean,
) => derivePanelDiffView({ baseline, panel, isCurrentUser });

describe("finding yourself in the published panel column", () => {
  it("names you on a slot matching the block's standard panel", () => {
    // This branch renders the word "Standardpanel" and no names at all, so
    // without an explicit signal an interviewer cannot tell which rows are
    // theirs without switching on the "Mine" filter.
    const result = view([ANNA, BJORN], [ANNA, BJORN], isAnna);

    expect(result.kind).to.equal("standard");
    expect(result.isCurrentUser).to.equal(true);
    if (result.kind !== "standard") throw new Error("expected standard");
    expect(result.currentUserName).to.equal("Anna Berg");
  });

  it("stays quiet on a standard panel that is not yours", () => {
    const result = view([BJORN, CARL], [BJORN, CARL], isAnna);

    expect(result.kind).to.equal("standard");
    expect(result.isCurrentUser).to.equal(false);
    if (result.kind !== "standard") throw new Error("expected standard");
    expect(result.currentUserName).to.equal(null);
  });

  it("marks only your chip when the full panel is listed", () => {
    const result = view(null, [ANNA, BJORN], isAnna);

    if (result.kind !== "roster") throw new Error("expected a roster");
    expect(result.members.map((entry) => entry.isCurrentUser)).to.deep.equal([
      true,
      false,
    ]);
    expect(result.isCurrentUser).to.equal(true);
  });

  it("marks you when you are the one swapped in", () => {
    const result = view([BJORN, CARL], [ANNA, CARL], isAnna);

    if (result.kind !== "deviation") throw new Error("expected a deviation");
    expect(result.isCurrentUser).to.equal(true);
    expect(
      result.segments.find((segment) => segment.isCurrentUser)?.text,
    ).to.equal("Anna Berg");
  });

  it("marks you when you are the one swapped out", () => {
    // A removed member is by definition absent from `panel`, so matching by
    // name against the seated panel would miss your own departure - the one
    // change you most need to see.
    const result = view([ANNA, CARL], [BJORN, CARL], isAnna);

    if (result.kind !== "deviation") throw new Error("expected a deviation");
    expect(result.isCurrentUser).to.equal(true);
    expect(
      result.segments.find((segment) => segment.isCurrentUser)?.text,
    ).to.equal("Anna Berg");
  });

  it("leaves an asymmetric change readable and marks your part of it", () => {
    const result = view([ANNA], [BJORN, CARL], isAnna);

    if (result.kind !== "deviation") throw new Error("expected a deviation");
    expect(result.label).to.equal("+Bjørn Dahl +Carl Eng −Anna Berg");
    expect(result.isCurrentUser).to.equal(true);
  });

  it("claims nobody when no current user is supplied", () => {
    expect(view([ANNA, BJORN], [ANNA, BJORN]).isCurrentUser).to.equal(false);
    expect(view(null, [ANNA]).isCurrentUser).to.equal(false);
    expect(view([BJORN], [ANNA]).isCurrentUser).to.equal(false);
  });
});
