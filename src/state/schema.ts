/* Shared domain types for the persisted app state.
   These describe the shape of `state` (see store.ts) so the domain and view
   layers get real autocomplete + checking instead of implicit `any`. */

export type EntryType = "PTO" | "Sick" | "Personal Holiday" | "Work Event" | "Bereavement" | "Jury Duty" | "Unpaid" | "Other" | string;
export type EntryStatus = "Scheduled" | "Pending" | "Taken" | "Cancelled" | string;

export interface Entry {
  date: string;            // ISO yyyy-mm-dd
  type: EntryType;
  hours: number;
  status?: EntryStatus;
  notes?: string;
  batchId?: string;        // groups a multi-day range entered together
}

export interface Allotment {
  year: number;
  vacation: number;
  sick: number | null;     // null = N/A (unconfirmed with HR)
  notes?: string;
}

export type PersonalHolidayStatus = "Unscheduled" | "Scheduled" | "Taken" | "Forfeited";
export interface PersonalHoliday {
  year: number;
  date: string | null;     // ISO date once scheduled
  status: PersonalHolidayStatus;
  notes?: string;
}

export interface Tier {
  years: number;
  vacDays: number;
  label: string;
  notes?: string;
}

export interface Holiday {
  date: string;            // ISO date
  name: string;
}

export interface Config {
  name: string;
  hire: string;            // ISO date
  year: number;
  workday: number;         // hours in a workday
  birthday?: string;
}

export type FridayStatus = "Open" | "Scheduled" | "Done" | "Cancelled";
export interface FridayAppt {
  purpose: string;
  status: FridayStatus;
  hours?: number | string; // per-Friday PTO-saved override; blank = default
}

/** The full persisted model. Optional fields are backfilled by store.load(). */
export interface AppState {
  config: Config;
  allotments: Allotment[];
  personalHolidays: PersonalHoliday[];
  tiers: Tier[];
  holidays: Holiday[];
  entries: Entry[];
  holidaysV?: string;
  calFilters?: Record<string, boolean>;
  fridays?: Record<string, FridayAppt>;
  logSearch?: string;
  logType?: string;
  logYear?: string;
  logStatus?: string;
  logMonth?: string;
  logHours?: string;
  logView?: "list" | "month";
  collapsedMonths?: Record<string, boolean>;
  dismissedInsights?: string[];
  showDismissed?: boolean;
  entryMode?: string;
  sugFilters?: Record<string, boolean>;
  chartRange?: number;
  notificationsSeen?: string[];
  // UI-only flags, set at runtime:
  cfgTipDismissed?: boolean;
  sugTipDismissed?: boolean;
  friShowAll?: boolean;
  calListCollapsed?: boolean;
  entryAllDay?: boolean;
  [key: string]: unknown;  // tolerate ad-hoc flags accessed via state[key]
}
