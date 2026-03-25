import { Candidate, Interviewer } from "../../types";

export const MOCK_CANDIDATES = [
  { id: "1", name: "Ola Nordmann", gender: "M" },
  { id: "2", name: "Kari Hansen", gender: "F" },
  { id: "3", name: "Erik Johansen", gender: "M" },
  { id: "4", name: "Sofie Berg", gender: "F" },
  { id: "5", name: "Morten Dahl", gender: "M" },
];

export const MOCK_INTERVIEWERS = [
  {
    id: "1",
    name: "Per Olsen",
    gender: "M",
    availability: [
      0 * 24 + 9,
      0 * 24 + 10,
      1 * 24 + 10,
      1 * 24 + 11,
      2 * 24 + 14,
      2 * 24 + 15,
    ],
  },
  {
    id: "2",
    name: "Anne Mikkelsen",
    gender: "F",
    availability: [
      0 * 24 + 9,
      0 * 24 + 10,
      0 * 24 + 11,
      3 * 24 + 13,
      3 * 24 + 14,
    ],
  },
  {
    id: "3",
    name: "Lars Hansen",
    gender: "M",
    availability: [
      1 * 24 + 10,
      1 * 24 + 11,
      1 * 24 + 12,
      2 * 24 + 14,
      4 * 24 + 9,
    ],
  },
  {
    id: "4",
    name: "Maria Eriksen",
    gender: "F",
    availability: [
      0 * 24 + 10,
      2 * 24 + 14,
      2 * 24 + 15,
      3 * 24 + 13,
      4 * 24 + 10,
    ],
  },
];
