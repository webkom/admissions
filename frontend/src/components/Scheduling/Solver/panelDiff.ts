import type { SchedulePanelMember } from "../types";

export const memberKey = (member: SchedulePanelMember): string =>
  member.id ?? member.name;
