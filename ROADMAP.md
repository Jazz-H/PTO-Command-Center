# 🗺️ PTO Command Center — Product Roadmap v2

> **v2 updates:** New backlog items PTO-501 through PTO-505 added from user feedback (July 7, 2026). See "What's New in v2" section below.
> **Reconciled July 7, 2026:** merged with work shipped this cycle (v1.1 → v1.4). PTO-101, PTO-104, and PTO-302 are now shipped and live on `main`.

---

## 📊 Current Status

| Metric | Value |
|---|---|
| Version | 2.0 (production) |
| Features shipped | 37 |
| File size | ~137 KB (single HTML) + icons + PWA |
| Backlog items | 15 |
| Est. total effort | ~10 weeks (part-time) |
| Roadmap version | v2 (reconciled) |

---

## 🆕 What's New in v2

Five new user-requested backlog items added based on real-world usage feedback:

| ID | Title | Tier |
|---|---|:-:|
| **PTO-501** | Dashboard: Show upcoming Friday WFH appointments + dismissable insights + drill-downs | 1 |
| **PTO-502** | Calendar: Make all draggable events beyond just PTO entries | 1 |
| **PTO-503** | Time Off Log: Hours/Days/Date-range input toggle + polished date picker | 1 |
| **PTO-504** | Smart Suggestions: Expand beyond CCCI holidays + WFH-Fridays | 2 |
| **PTO-505** | Polished sidebar collapse button (best-practice pattern) | 1 |

---

## 🎯 Working Rules for Claude Code

1. **One task per branch.** Naming: `pto-XXX-short-description` (this project develops on `claude/new-session-moofhd`).
2. **Preserve the single-file architecture.** No splitting unless explicit.
3. **Test before merge:** smoke test (dashboard loads, add entry works, calendar renders, dark mode toggles) + feature-specific verification in a real browser.
4. **Migration-safe:** Any localStorage schema change must include migration in `load()`.
5. **Preserve backwards compat:** Existing user data must never be destroyed.
6. **Update this file:** Move completed items to "✅ Shipped" section.
7. **v2 items are prioritized** — user has explicitly requested these fixes.

---

## 🚀 Tier 1 — Quick Wins (< 4 hours each)

---

## 🚧 Tier 2 — Medium Effort (1–3 days each)

### 🟡 PTO-504b: Smart Suggestions — remaining categories (follow-up)
- **Effort:** ~1 day
- **Priority:** Medium
- **Context:** PTO-504's engine + grouped UI + explainability shipped in v1.9 (strong subset). Deferred pieces:
  - [ ] Seasonal windows (Spring break / Summer peak / Fall foliage / Winter holidays)
  - [ ] Low-usage / historical-pattern strategies (needs prior-year data)
  - [ ] Full suggestion-preferences panel (home location, preferred season, min-ROI threshold)
  - [ ] Dedicated "Vacation Plan" distribution view (v1.9 ships a lite balance-plan row)
- **Note:** New strategies plug into the shipped `buildAllSuggestions()` engine.

### 🔴 PTO-301: SharePoint List backend for multi-device sync
- **Effort:** 2 days
- **Priority:** Critical
- **Files touched:** `index.html`, new `SETUP_SHAREPOINT.md`
- **Acceptance criteria:**
  - [ ] Two SharePoint lists: `PTO_Log` and `PTO_Config`
  - [ ] User enters tenant + list URLs in Settings
  - [ ] "Sync now" button pushes localStorage to SharePoint
  - [ ] "Pull from SharePoint" overwrites localStorage
  - [ ] Auto-sync every 5 minutes when tab active
  - [ ] Conflict resolution: last-write-wins with timestamp warning
  - [ ] Offline changes queue and sync when back online

### 🔴 PTO-303: Power Automate weekly digest flow
- **Effort:** 1 day
- **Priority:** Critical
- **Depends on:** PTO-301

### 🟡 PTO-304: Personal Holiday reminder email
- **Effort:** 4h · **Priority:** High · **Depends on:** PTO-301

### 🟡 PTO-305: Year-over-year usage comparison chart
- **Effort:** 6h · **Priority:** Medium

### 🟡 PTO-306: Team calendar overlay
- **Effort:** 2 days · **Priority:** Medium

### 🟢 PTO-308: Anniversary celebration email
- **Effort:** 3h · **Priority:** Low

---

## 🎢 Tier 3 — Strategic (1+ weeks each)

### 🔴 PTO-401: Power BI dashboard
- **Effort:** 3 days · **Priority:** Critical · **Depends on:** PTO-301

### 🔴 PTO-402: Osapiens / CONA integration
- **Effort:** 2 weeks · **Priority:** High

### 🟡 PTO-403: Approval workflow via Teams
- **Effort:** 1 week · **Priority:** High · **Depends on:** PTO-301

### 🟡 PTO-404: AI Trip Planner
- **Effort:** 1 week · **Priority:** Medium
- **Note:** Should leverage the SuggestionEngine architecture from PTO-504

### 🟡 PTO-405: Multi-employee mode
- **Effort:** 1 week · **Priority:** Medium

### 🟢 PTO-406: Weather-aware suggestions
- **Effort:** 5 days · **Priority:** Low
- **Note:** Plugs into the SuggestionEngine strategies from PTO-504

### 🟢 PTO-407: Cost calculator
- **Effort:** 3 days · **Priority:** Low

### 🟢 PTO-408: Native iOS/Android app
- **Effort:** 2 weeks · **Priority:** Low · **Depends on:** PTO-103

---

## 🐛 Known Issues / Tech Debt

| ID | Description | Severity |
|---|---|:-:|
| BUG-01 | Chart re-renders on every refresh (perf) | Low |
| BUG-02 | PH migration edge case if user manually deletes log entry | Medium |
| BUG-03 | ~~Sidebar collapse button cut off in dark mode~~ — ✅ fixed in PTO-505 (v1.8) | Medium |
| DEBT-01 | Split monolithic HTML into multiple files | Low |
| DEBT-02 | Add lightweight test file with core flows | Medium |
| DEBT-03 | Chart.js CDN dependency — inline for true offline | Low |

---

## 💡 Ideas Parking Lot (Not Prioritized)

- Voice input: "Add sick day today" via Web Speech API
- Auto-complete common notes ("Doctor appt", "Dental cleaning")
- Emoji reactions per entry (☀️ great vacation, 🤒 bad sick day)
- Yearly retrospective auto-generated on Dec 31
- Shareable read-only public link
- Import from Outlook calendar (parse OOO entries)
- Import from Excel spreadsheet (drop the .xlsx → auto-parse)
- Multi-language support (Spanish for CCCI's Latin operations)
- Vacation goal tracking
- Random vacation suggestion generator

---

## ✅ Shipped

### v2.0 — Enterprise UI redesign (July 2026)
- **UI/UX overhaul to match the provided mockup.** Blue primary accent (active nav, primary buttons, chart) with the red brand mark retained; new topbar with a global search ("Search anything… ⌘K" → Log search), notification bell, **Request Time Off** CTA, and a user chip; sidebar sections renamed Overview / Planning / Configuration with a blue active state and blue avatar. Dashboard rebuilt: time-aware greeting ("Good morning/afternoon/evening, Jazz 👋"), 5 KPI cards including a **usage progress ring** (green/amber/red) on Vacation Balance, a **month-over-month trend** on Used YTD, and promoted **Personal Holiday** (inline schedule) and **Next Anniversary** cards; insights moved to a **dismissible horizontal row** with "Dismiss all"; balance-projection chart gained a **3M/6M/1Y/All range toggle** beside the usage doughnut; Upcoming Time Off and Upcoming Fridays became **horizontal card rows**. Verified in Chromium across desktop/tablet/mobile and light/dark — no overflow, no errors; range toggle, dismiss-all, global search, and Request-Time-Off all functional.

### v1.15 — Print stylesheet (July 2026)
- **PTO-202** — An `@media print` layer: hides the sidebar, topbar, toolbars, filter chips, buttons, and the add-entry form; prints only the active panel; forces a light palette even in dark mode; keeps cards from breaking across pages; and adds a "PTO Summary — [name] — [date]" header (hidden on screen). Verified via print-media emulation in Chromium.

### v1.14 — PWA (installable + offline) (July 2026)
- **PTO-103** — Added `manifest.json` (name, standalone display, theme/background colors, 192/512 + 180 icons, start_url) and a `sw.js` service worker: precaches the app shell on install, cleans old caches on activate (bump `pto-cache-v1` to force refresh), network-first for the HTML document, cache-first with runtime caching for assets + CDN libs/fonts. Registered from `index.html` (guarded to http/https). Verified over a real HTTP server in Chromium: SW registers & activates, shell cached, and the app loads **offline** after first visit (title + nav render). Installable in Chrome/Edge; adds a home-screen icon on iOS/Android. **Tier 1 backlog now fully shipped.** (True offline for the charts still wants Chart.js inlined — tracked as DEBT-03.)

### v1.13 — Custom favicon + icons (July 2026)
- **PTO-201** — Added a brand favicon: a scalable `favicon.svg` ("PT" mark on the red→slate brand gradient), a 32px PNG fallback, a 180×180 `apple-touch-icon.png`, and a `theme-color` meta of CCCI red (`#DC2626`). Also rendered 192/512 PNG icons to prep the PWA work (PTO-103). Icons show in the browser tab, bookmarks, and iOS/Android home screen.

### v1.12 — Slash-command search (July 2026)
- **PTO-105** — The log search box now parses slash-commands that stack with each other and free text: `/vac /sick /personal /holiday /bereavement /jury /unpaid` (type), `/2026` (year), `/jul` or `/july` (month). Later type commands override earlier ones; everything else filters as free text. Verified: each command, month abbrev/full, stacking, and free-text fallthrough.

### v1.11 — CSV export (July 2026)
- **PTO-307** — "Export CSV" button in Settings writes `pto_entries_YYYYMMDD.csv` with columns Date, Day, Type, Hours, Status, Notes (sorted by date). Proper CSV quoting/escaping for commas, quotes, and newlines, plus a UTF-8 BOM so Excel opens it cleanly. Verified: header, row count, and escaping of a `Trip: Rome, "gelato"` note.

### v1.10 — iCal export (July 2026)
- **PTO-102** — "Export to calendar (.ics)" button in Settings generates a valid RFC 5545 file (`PRODID:-//Jazz Harris//PTO Command Center//EN`, CRLF, line folding, escaped text). Each entry becomes an all-day `VEVENT` (exclusive `DTEND`), with type emoji in the summary, `CATEGORIES` per type (Vacation/Sick/Personal Holiday/…), status + notes in the description, unique UIDs, and `TRANSP:TRANSPARENT`. A checkbox optionally includes CCCI company holidays as events. Filename `pto_calendar_YYYYMMDD.ics`. Imports into Outlook / Google / Apple Calendar. Verified: structure, all-day dates, counts (16 entries / 25 with holidays), unique UIDs, no errors.

### v1.9 — Smart Suggestions engine (July 2026)
- **PTO-504 (strong subset)** — Refactored `buildSuggestions()` into a pluggable `buildAllSuggestions()` engine returning unified `{category, occasion, takeOn, result, hours, roi, reason, bookable}` items. Strategies: company-holiday bridges, **federal long weekends** (future US federal holidays CCCI doesn't observe, with a real long-weekend span), **adjacent-weekend extensions** (one Monday/month, WFH-Friday aware), **personal anchors** (birthday from Settings + work anniversary), and a **balance-plan** row (spread remaining days before Dec 31). Suggestions tab regrouped by category with toggle filter chips (persisted to `state.sugFilters`) and a hover "why" tooltip on every row. Birthday field added to Settings. Calendar "Try PTO" tags stay limited to company bridges to avoid clutter. Remaining categories tracked as **PTO-504b**. Verified end-to-end in Chromium; no overflow; smoke test passes.

### v1.8 — Polished sidebar collapse button (July 2026)
- **PTO-505** — Replaced the tiny circular toggle that floated at `right:-14px` (and clipped in dark mode) with a proper bottom-docked button below the user card (Notion/Linear pattern). Full-width "‹ Collapse" when expanded, icon-only centered "›" when collapsed, with a 200ms chevron rotation, hover/active/focus-ring states that behave in both themes, and dynamic `aria-expanded` / `aria-label` / `aria-controls`. Ctrl/Cmd+B unchanged; hidden on mobile (drawer mode). Fixes **BUG-03**.

### v1.7 — Log input modes + custom date picker (July 2026)
- **PTO-503** — Add-entry input toggle (Hours / Days / Range). Days converts to hours (`days × workday`); Range creates one entry per business day (weekends, company holidays, and already-booked days excluded) sharing a `batchId`, with a live "N entries totaling M hours" preview. Batch delete removes the whole batch on confirm; batch edit applies type/status/notes to all siblings. Custom in-file date picker (replaces native inputs on the add form + edit modal): month grid with weekends greyed, company holidays in violet, existing entries dotted green, conflicts disabled, keyboard nav (arrows/PageUp-Down/Enter/Esc), and a Today button. Two-picker range selection. Verified end-to-end in Chromium including keyboard nav and Esc layering over the edit modal.

### v1.6 — Extended calendar drag (July 2026)
- **PTO-502** — Generalized the drag system to three payload types. Friday appointments drag to other Fridays only (non-Friday and already-booked Fridays blocked in red; `state.fridays` key moves). Suggestion chips are draggable and book a Vacation entry on whatever valid weekday they're dropped on (weekend/holiday/occupied blocked). Company holidays and anniversaries stay non-draggable. Existing PTO/Personal-Holiday drag (PTO-302) unchanged.

### v1.5 — Dashboard enhancements (July 2026)
- **PTO-501** — New "Upcoming Fridays" card beside "Upcoming time off" (next WFH Fridays with scheduled appointments, cyan chips, "This Friday" marker, empty-state link to the Friday Planner). Dismissable insights with an "×" per card, dismissed IDs persisted (`state.dismissedInsights`, stable type+heading hash), a "Show dismissed (N)" header toggle, and critical use-it-or-lose-it alerts locked from dismissal. Drill-downs: KPI cards jump to the filtered Log (Vacation/Sick/year) or Anniversaries; upcoming-time-off rows open the Calendar at that date; Friday rows jump to the Planner and flash the row — each with a hover arrow affordance.

### v1.4 — Responsive / mobile layout + QA polish (July 2026)
- **Mobile & tablet responsiveness** — breakpoints at 820px/560px; sidebar becomes an off-canvas drawer (hamburger + backdrop, closes on nav tap/Esc); single-column stacking; calendar fits the full 7-day grid; data tables scroll horizontally instead of clipping. Desktop unchanged.
- **QA/UAT polish** — fixed CSS grid/flex blow-out at ≤320px (dashboard cards, chart, insights, upcoming table, Settings rows, edit modal). Audited every element's box vs. the viewport across 768/414/390/360/320px on all seven tabs plus the edit modal — zero horizontal overflow anywhere down to 320px.

### v1.3 — Month-grouped log view (July 2026)
- **PTO-104** — "List | By month" toggle; collapsible month headers with entry count / total hours / day count; per-month collapse and view choice persist; respects active filters.

### v1.2 — Log search & filter (July 2026)
- **PTO-101** — search (date/type/status/notes/day-of-week/month, debounced) + type & auto-populated year filters; "X of Y entries" count; `Ctrl/Cmd + K` focuses search on the Log tab; state persists.

### v1.1 — Calendar rescheduling (July 2026)
- **PTO-302** — drag any entry tag to a new day; blue/red drop validity (blocks weekends, company holidays, occupied days); Personal Holiday sync; full app refresh on drop.

### v1.0 — Initial release (July 2026)
- Dashboard KPIs (vacation/used/sick/refill)
- Time Off Log CRUD with edit modal
- Calendar month view with color-coded cells
- Balance projection chart (rolling 12-month with annotations)
- Usage breakdown doughnut chart
- Upcoming time off widget
- Personal Holiday tracker (with 90-day eligibility)
- Smart Suggestions engine (WFH-Friday aware)
- 8+ personalized insights
- Anniversary timeline (7 tiers)
- Vacation bump alerts
- Use-it-or-lose-it escalating alerts
- Friday Planner with calendar overlay
- Toggleable calendar legend
- Today button + prev/next nav
- Book-from-suggestion (one-click)
- Dark mode (true black) with Ctrl+J
- Collapsible sidebar with Ctrl+B
- Settings tab (live-edit allotments/holidays/tiers)
- Export/Import JSON backup
- Auto-migration on load

---

## 🎯 Recommended v2 Sprint Order

### Sprint 1 (~10 hours)
1. **PTO-505** Sidebar polish (2h) — fixes visible bug from screenshot (BUG-03)
2. **PTO-201** Favicon (1h) — prerequisite for PWA
3. **PTO-501** Dashboard enhancements (3h) — high daily-use impact
4. ~~**PTO-101** Search + filter~~ ✅ shipped v1.2
5. **PTO-102** iCal export (3h)

### Sprint 2 (~11 hours)
1. **PTO-503** Log input modes + polished picker (4h)
2. **PTO-502** Extended draggable events (3h)
3. ~~**PTO-104** Month-grouped log view~~ ✅ shipped v1.3
4. **PTO-103** PWA (4h)

### Sprint 3 (~8 hours)
1. **PTO-504** Enhanced Smart Suggestions (2 days)
2. **PTO-105** Slash commands (2h)
3. **PTO-202** Print styles (2h)

---

## 📞 Contacts

- **Product owner:** Jazz Harris (Business Analyst II)
- **Manager review:** Uchenna Iruka-Johnson
- **HR policy Q's:** Brie (confirmed 2-year vacation bump)
- **CONA/Osapiens Q's:** Oscar Torres
- **SharePoint/Power Platform:** Andre (Scrum & Coke team)

---

## 📚 Related Docs

- `README.md` — feature overview & deployment
- `QUICKSTART.md` — 60-second GitHub Pages setup
- `BACKLOG.md` — quick checklist version of this file

---

_Roadmap v2 (reconciled) — Last updated: July 7, 2026_
