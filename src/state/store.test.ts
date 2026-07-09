import { describe, it, expect } from "vitest";
import { nameFromEmail } from "./store.ts";

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
