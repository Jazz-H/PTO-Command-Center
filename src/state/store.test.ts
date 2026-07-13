import { describe, it, expect } from "vitest";
import { nameFromEmail, ptoMigrate } from "./store.ts";

describe("ptoMigrate — 2027 company holidays", () => {
  it("adds the eight 2027 holidays once, idempotently, without duplicating existing dates", () => {
    const st: any = ptoMigrate({ entries: [], holidays: [{ date: "2027-01-01", name: "New Year's Day" }] });
    const h2027 = st.holidays.filter(h => h.date.startsWith("2027")).map(h => h.date).sort();
    expect(h2027).toEqual(["2027-01-01","2027-01-18","2027-03-26","2027-05-31","2027-07-05","2027-09-06","2027-11-25","2027-12-24"]);
    expect(st.holidays2027).toBe(true);
    const again: any = ptoMigrate(st);   // idempotent
    expect(again.holidays.filter(h => h.date.startsWith("2027")).length).toBe(8);
  });

  it("does not re-add once the flag is set (respects user-removed holidays)", () => {
    const st: any = ptoMigrate({ entries: [], holidays: [], holidays2027: true });
    expect(st.holidays.filter(h => h.date.startsWith("2027")).length).toBe(0);
  });
});

describe("nameFromEmail", () => {
  it("splits and title-cases dotted / underscored / hyphenated locals", () => {
    expect(nameFromEmail("jane.doe@ccci.org")).toBe("Jane Doe");
    expect(nameFromEmail("john_smith@x.com")).toBe("John Smith");
    expect(nameFromEmail("mary-jane.watson@x.com")).toBe("Mary Jane Watson");
  });

  it("strips digits and plus-tags", () => {
    expect(nameFromEmail("john.smith2@x.com")).toBe("John Smith");
    expect(nameFromEmail("jane.doe+pto@x.com")).toBe("Jane Doe");
  });

  it("returns empty when nothing usable is left", () => {
    expect(nameFromEmail("mh216347@gmail.com")).toBe("");   // pure-initials login → blank, not gibberish
    expect(nameFromEmail("")).toBe("");
    expect(nameFromEmail("12345@x.com")).toBe("");
  });
});
