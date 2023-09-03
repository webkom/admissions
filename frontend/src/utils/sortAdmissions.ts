import { Application } from "src/types";

interface ApplicationComparator {
  compare(app1: Application, app2: Application): number;
  description: string;
}

const CreatedAtComparatorDesc: ApplicationComparator = {
  compare: (app1, app2) => {
    const date1 = new Date(app1.created_at);
    const date2 = new Date(app2.created_at);
    return date1.getTime() - date2.getTime();
  },
  description: "Dato opprettet synkende",
};

const CreatedAtComparatorAsc: ApplicationComparator = {
  compare: (app1, app2) => {
    const date1 = new Date(app1.created_at);
    const date2 = new Date(app2.created_at);
    return date2.getTime() - date1.getTime();
  },
  description: "Dato opprettet stigende",
};

const UpdatedAtComparatorAsc: ApplicationComparator = {
  compare: (app1, app2) => {
    const date1 = new Date(app1.updated_at);
    const date2 = new Date(app2.updated_at);
    return date1.getTime() - date2.getTime();
  },
  description: "Dato oppdatert stigende",
};

const UpdatedAtComparatorDesc: ApplicationComparator = {
  compare: (app1, app2) => {
    const date1 = new Date(app1.updated_at);
    const date2 = new Date(app2.updated_at);
    return date2.getTime() - date1.getTime();
  },
  description: "Dato oppdatert synkende",
};

const AlphabeticalComparatorAsc: ApplicationComparator = {
  compare: (app1, app2) => {
    return app2.user.full_name.localeCompare(app1.user.full_name);
  },
  description: "Alfabetisk stigende",
};

const AlphabeticalComparatorDesc: ApplicationComparator = {
  compare: (app1, app2) => {
    return app1.user.full_name.localeCompare(app2.user.full_name);
  },
  description: "Alfabetisk synkende",
};

export type { ApplicationComparator };
export {
  CreatedAtComparatorDesc,
  CreatedAtComparatorAsc,
  UpdatedAtComparatorAsc,
  UpdatedAtComparatorDesc,
  AlphabeticalComparatorAsc,
  AlphabeticalComparatorDesc,
};
