import { describe, it, expect, beforeEach } from "vitest";
import { seed } from "../test/fixtures.ts";
import { state } from "../state/store.ts";
import { csvCell, parseCSVText, parseHtmlTable, normImportDate, normImportType, ingestEntryRows, icsEscape, icsFold } from "./importexport.ts";

describe("importexport — pure serializers/parsers", () => {
  it("csvCell quotes only when needed", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
  });

  it("parseCSVText handles quotes, commas and CRLF", () => {
    const rows = parseCSVText('Date,Notes\r\n2026-01-01,"a, b"\r\n2026-01-02,plain\r\n');
    expect(rows).toEqual([["Date", "Notes"], ["2026-01-01", "a, b"], ["2026-01-02", "plain"]]);
  });

  it("parseHtmlTable reads an HTML table into rows (DOMParser)", () => {
    const rows = parseHtmlTable("<table><tr><th>Date</th><th>Type</th></tr><tr><td>2026-01-01</td><td>PTO</td></tr></table>");
    expect(rows).toEqual([["Date", "Type"], ["2026-01-01", "PTO"]]);
  });

  it("normImportDate normalizes ISO, Date objects, Excel serials; rejects junk", () => {
    expect(normImportDate("2026-7-4")).toBe("2026-07-04");   // zero-pads
    expect(normImportDate(new Date(2026, 6, 4))).toBe("2026-07-04");
    expect(normImportDate("")).toBeNull();
    expect(normImportDate("not a date")).toBeNull();
    // Excel serial (days since 1899-12-30) → a valid ISO date
    const serial = normImportDate("45900");
    expect(serial).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("normImportDate handles slash/dash/dot and day-first text dates", () => {
    expect(normImportDate("7/9/2026")).toBe("2026-07-09");     // US month-first
    expect(normImportDate("07/09/26")).toBe("2026-07-09");     // 2-digit year
    expect(normImportDate("13/07/2026")).toBe("2026-07-13");   // day-first (13 can't be a month)
    expect(normImportDate("7-9-2026")).toBe("2026-07-09");     // dash separators
    expect(normImportDate("7.9.2026")).toBe("2026-07-09");     // dot separators
    expect(normImportDate("9-Jul-2026")).toBe("2026-07-09");   // dash + named month
    expect(normImportDate("Jul 9, 2026")).toBe("2026-07-09");  // named month
    expect(normImportDate("99/99/2026")).toBeNull();           // still rejects junk
  });

  it("normImportType maps aliases and passes through unknowns", () => {
    expect(normImportType("vac")).toBe("PTO");
    expect(normImportType("Vacation")).toBe("PTO");
    expect(normImportType("sick")).toBe("Sick");
    expect(normImportType("ph")).toBe("Personal Holiday");
    expect(normImportType("")).toBe("PTO");
    expect(normImportType("Bereavement")).toBe("Bereavement");
    expect(normImportType("OOO")).toBe("PTO");
    expect(normImportType("Out of Office")).toBe("PTO");
    expect(normImportType("Out Sick")).toBe("Sick");
  });

  it("icsEscape / icsFold follow the RFC basics", () => {
    expect(icsEscape("a,b;c\nd")).toBe("a\\,b\\;c\\nd");
    const folded = icsFold("X".repeat(100));
    expect(folded).toContain("\r\n ");     // long lines wrap
    expect(icsFold("short")).toBe("short");
  });
});

describe("importexport — ingestEntryRows", () => {
  beforeEach(() => seed({ entries: [] }));

  it("adds new rows, de-dupes on date|type|hours, flags bad dates", () => {
    const res = ingestEntryRows([
      ["Date", "Type", "Hours", "Status", "Notes"],
      ["2026-08-14", "PTO", "8", "Approved", "trip"],
      ["2026-08-14", "PTO", "8", "Approved", "same key → dup"],
      ["not-a-date", "PTO", "8", "", "bad"],
    ]);
    expect(res).toEqual({ added: 1, dup: 1, bad: 1 });
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({ date: "2026-08-14", type: "PTO", hours: 8, status: "Approved" });
  });

  it("signals an unrecognized format with added:-1", () => {
    expect(ingestEntryRows([["totally", "wrong"]])).toEqual({ added: -1 });
    expect(ingestEntryRows([])).toEqual({ added: -1 });
  });

  it("skips preamble, reads Start/End Date + # of Days, maps OOO/Out Sick, skips trailer rows", () => {
    const res = ingestEntryRows([
      ["2026 PTO / Sick Time Tracker Upload", "", "", "", "", ""],   // title preamble
      ["Name: Harris, Jazz", "", "", "", "", ""],                    // preamble
      ["", "", "", "", "", ""],                                      // blank
      ["Name", "Start Date", "End Date", "# of Days", "Type (PTO / Holiday / OOO)", "Coverage / Notes"],
      ["Harris, Jazz", "1/29/26", "1/30/26", "1.5", "OOO", "PTO"],   // range → note; 1.5 days → 12h
      ["Harris, Jazz", "4/30/26", "5/1/26", "", "Out Sick", ""],     // blank days → 1 workday; Sick
      ["Harris, Jazz", "6/15/26", "6/15/26", "1.0", "OOO", "PTO"],   // single day
      ["", "", "Total Days from Screenshot", "11.5", "", ""],        // trailer → blank date, skipped (not "bad")
    ]);
    expect(res).toEqual({ added: 3, dup: 0, bad: 0 });
    expect(state.entries[0]).toMatchObject({ date: "2026-01-29", type: "PTO", hours: 12, notes: "PTO (through 2026-01-30)" });
    expect(state.entries[1]).toMatchObject({ date: "2026-04-30", type: "Sick", hours: 8, notes: "(through 2026-05-01)" });
    expect(state.entries[2]).toMatchObject({ date: "2026-06-15", type: "PTO", hours: 8, notes: "PTO" });
  });

  it("de-dupes against entries already in state", () => {
    seed({ entries: [{ date: "2026-08-14", type: "PTO", hours: 8, status: "Approved", notes: "" }] });
    const res = ingestEntryRows([
      ["Date", "Type", "Hours"],
      ["2026-08-14", "PTO", "8"],   // already present
      ["2026-08-15", "PTO", "8"],   // new
    ]);
    expect(res).toEqual({ added: 1, dup: 1, bad: 0 });
    expect(state.entries).toHaveLength(2);
  });
});
