import msicOfficialData from "./msicOfficial.json";

export type MsicEntry = {
  code: string;
  item: string;
  section: string;
  division: string;
  group: string;
  className: string;
};

export const msicOfficialEntries = msicOfficialData as MsicEntry[];

export const msicEntryByCode = new Map(msicOfficialEntries.map((entry) => [entry.code, entry]));
