# 🗺️ PTO Command Center — Product Roadmap & Backlog

> **For Claude Code:** Work items are sorted by priority within tiers. Each task has an ID, acceptance criteria, technical notes, and file-touch hints. Use `#PTO-XXX` when referencing tasks in commit messages or branches.

---

## 📊 Current Status

| Metric | Value |
|---|---|
| Version | 1.2 (production) |
| Features shipped | 23 |
| File size | ~98 KB (single HTML) |
| Backlog items | 21 |
| Est. total effort | ~10 weeks (part-time) |

---

## 🎯 Working Rules for Claude Code

1. **One task per branch.** Branch naming: `pto-XXX-short-description`
2. **Preserve the single-file architecture.** No splitting into multiple JS/CSS files unless a task explicitly says so.
3. **Test before merge:** Every change must pass the smoke test in `TESTING.md` (dashboard loads, add entry works, calendar renders, dark mode toggles).
4. **Migration-safe:** Any localStorage schema change must include a migration in the `load()` function. Bump `holidaysV` or add a new version flag.
5. **Preserve backwards compat:** Existing user data (`localStorage.pto_state`) must never be destroyed by an update.
6. **Update this file:** Move completed items from a backlog tier to the "✅ Shipped" section at the bottom.

---

## 🚀 Tier 1 — Quick Wins (< 4 hours each)

### 🔴 PTO-102: iCal (.ics) export
- **Effort:** 3h
- **Priority:** Critical
- **Files touched:** `index.html` (new export function + Settings button)
- **Acceptance criteria:**
  - [ ] "Export iCal" button in Settings tab and topbar
  - [ ] Generates valid `.ics` file per RFC 5545
  - [ ] Each PTO entry becomes an `VEVENT` with correct dtstart/dtend
  - [ ] Personal Holidays included with pink category tag
  - [ ] Company holidays included as separate calendar or filtered out (user choice via checkbox)
  - [ ] Filename: `pto_calendar_YYYYMMDD.ics`
  - [ ] Successfully imports into Outlook, Google Calendar, Apple Calendar
- **Technical notes:**
  - No external library needed — build ICS string manually
  - Format dates as `YYYYMMDD` for all-day events
  - Use `PRODID:-//Jazz Harris//PTO Command Center//EN`

### 🔴 PTO-103: PWA manifest + service worker
- **Effort:** 4h
- **Priority:** Critical
- **Files touched:** `index.html`, new `manifest.json`, new `sw.js`
- **Acceptance criteria:**
  - [ ] `manifest.json` with name, icons (192px, 512px), theme_color, start_url
  - [ ] Service worker caches all app assets (Chart.js, fonts, index.html)
  - [ ] Works offline after first load (verify in DevTools → Network → Offline)
  - [ ] "Install" prompt appears in Chrome/Edge
  - [ ] Home-screen icon on iOS/Android
  - [ ] Version bump in SW forces cache refresh on updates
- **Technical notes:**
  - Cache strategy: cache-first for assets, network-first for the HTML
  - Icons should use the PTO brand mark (red gradient square)
  - Test on both mobile and desktop
- **Depends on:** PTO-201 (custom favicon)

### 🟡 PTO-104: Month-grouped Log view
- **Effort:** 3h
- **Priority:** High
- **Files touched:** `index.html` (view toggle + new renderer + CSS)
- **Acceptance criteria:**
  - [ ] Toggle button in log toolbar: "List" | "By month"
  - [ ] Month view groups entries under collapsible headers (e.g., "July 2026")
  - [ ] Each group shows: entry count, total hrs, days count
  - [ ] Collapse state persists per-month to `state.collapsedMonths[key]`
  - [ ] Groups sorted descending (newest first)
  - [ ] View preference persists to `state.logView`

### 🟢 PTO-105: Slash-command search
- **Effort:** 2h
- **Priority:** Medium
- **Files touched:** `index.html` (search handler)
- **Acceptance criteria:**
  - [ ] Typing `/vac` filters to Vacation type
  - [ ] `/sick`, `/personal`, `/holiday` work similarly
  - [ ] `/2026` filters by year
  - [ ] `/jul` or `/july` filters by month
  - [ ] Slash-commands stack with regular search (e.g., `/vac dentist`)

### 🟢 PTO-201: Custom favicon + splash
- **Effort:** 1h
- **Priority:** Low
- **Files touched:** `index.html` (link tags), new `favicon.svg`, new icon PNGs
- **Acceptance criteria:**
  - [ ] SVG favicon showing "PT" mark or a mini calendar icon
  - [ ] Apple touch icon (180×180) with rounded corners
  - [ ] Theme-color meta tag matches CCCI red
  - [ ] Shows correctly in browser tab, bookmark, home screen

### 🟢 PTO-202: Print-friendly stylesheet
- **Effort:** 2h
- **Priority:** Low
- **Files touched:** `index.html` (add `@media print` styles)
- **Acceptance criteria:**
  - [ ] Sidebar hidden when printing
  - [ ] Charts render at reasonable sizes
  - [ ] Only visible panel prints (not all tabs)
  - [ ] Page breaks between major sections (KPIs, chart, insights, log)
  - [ ] Print header shows "PTO Summary — Jazz Harris — [date]"
  - [ ] Dark mode disabled during print (always light)

---

## 🚧 Tier 2 — Medium Effort (1–3 days each)

### 🔴 PTO-301: SharePoint List backend for multi-device sync
- **Effort:** 2 days
- **Priority:** Critical
- **Files touched:** `index.html` (new sync module), new `SETUP_SHAREPOINT.md`
- **Acceptance criteria:**
  - [ ] Two SharePoint lists: `PTO_Log` and `PTO_Config`
  - [ ] User can enter tenant + list URLs in Settings
  - [ ] "Sync now" button pushes localStorage state to SharePoint
  - [ ] "Pull from SharePoint" button overwrites localStorage
  - [ ] Auto-sync every 5 minutes when tab active
  - [ ] Conflict resolution: last-write-wins with timestamp warning
  - [ ] Offline changes queue and sync when back online
- **Technical notes:**
  - Use Microsoft Graph API with implicit auth
  - Store MSAL config in Settings (client ID, tenant)
  - Include full SharePoint list schema in setup doc
  - Add "Last synced" timestamp visible in topbar

### 🔴 PTO-303: Power Automate weekly digest flow
- **Effort:** 1 day
- **Priority:** Critical
- **Files touched:** New `flows/weekly_digest_flow.json`, update existing `PTO_Weekly_Digest.html`, new `AUTOMATION.md`
- **Acceptance criteria:**
  - [ ] Documented Power Automate flow that runs every Monday 7:30 AM
  - [ ] Reads from `PTO_Log` SharePoint list (from PTO-301)
  - [ ] Sends styled HTML email to user's Outlook
  - [ ] Includes: balance, YTD used, top suggestion, upcoming 4 weeks
  - [ ] JSON export of the flow importable via Power Automate
- **Depends on:** PTO-301

### 🟡 PTO-304: Personal Holiday reminder email
- **Effort:** 4h
- **Priority:** High
- **Files touched:** New `flows/ph_reminder_flow.json`, `AUTOMATION.md`
- **Acceptance criteria:**
  - [ ] Power Automate flow fires Nov 1
  - [ ] Checks PTO_Log for a "Personal Holiday" entry in current year
  - [ ] If none, sends "Your PH forfeits Dec 31" email with 8 suggested dates
- **Depends on:** PTO-301

### 🟡 PTO-305: Year-over-year usage comparison chart
- **Effort:** 6h
- **Priority:** Medium
- **Files touched:** `index.html` (new chart on dashboard or anniversaries tab)
- **Acceptance criteria:**
  - [ ] Bar chart comparing vacation hrs used per month, this year vs. last year
  - [ ] Toggle to compare against 2-year avg
  - [ ] Insight: "You're on track to use X% more than last year"

### 🟡 PTO-306: Team calendar overlay
- **Effort:** 2 days
- **Priority:** Medium
- **Files touched:** `index.html` (new "Team" tab), depends on backend
- **Acceptance criteria:**
  - [ ] Optional "Team members" list in Settings (name + email)
  - [ ] Team members' PTO shows as faint colored bars on calendar
  - [ ] Warns if you're planning PTO on a day when >50% of team is out

### 🟡 PTO-307: CSV export
- **Effort:** 3h
- **Priority:** Medium
- **Files touched:** `index.html` (new export function)
- **Acceptance criteria:**
  - [ ] "Export CSV" button in Settings
  - [ ] Columns: Date, Day, Type, Hours, Status, Notes
  - [ ] Opens cleanly in Excel with proper column widths
  - [ ] Filename: `pto_entries_YYYYMMDD.csv`

### 🟢 PTO-308: Anniversary celebration email
- **Effort:** 3h
- **Priority:** Low
- **Files touched:** New `flows/anniversary_flow.json`, `AUTOMATION.md`
- **Acceptance criteria:**
  - [ ] Fires on the morning of each service anniversary (7/28 for Jazz)
  - [ ] "Happy X years!" email with a confetti graphic
  - [ ] Includes vacation-bump info if applicable

---

## 🎢 Tier 3 — Strategic (1+ weeks each)

### 🔴 PTO-401: Power BI dashboard
- **Effort:** 3 days
- **Priority:** Critical
- **Files touched:** New `powerbi/PTO_Dashboard.pbix`, new `POWERBI_SETUP.md`
- **Acceptance criteria:**
  - [ ] .pbix file connected to `PTO_Log` SharePoint list
  - [ ] Pages: Overview, Historical Trends, Team Analytics
  - [ ] Slicers: Year, Type, Status
  - [ ] Publishable to Power BI Service with row-level security
- **Depends on:** PTO-301

### 🔴 PTO-402: Osapiens / CONA integration
- **Effort:** 2 weeks
- **Priority:** High
- **Files touched:** Depends on API availability; potentially new SharePoint connector
- **Acceptance criteria:**
  - [ ] When a driver logs sick in CONA, it auto-creates a PTO_Log entry
  - [ ] Coordinate with CONA team (Oscar) for API/webhook access
  - [ ] Documented in `INTEGRATIONS.md`
- **Notes:** May not be feasible without CONA team buy-in — investigate first

### 🟡 PTO-403: Approval workflow via Teams
- **Effort:** 1 week
- **Priority:** High
- **Files touched:** New `flows/approval_flow.json`, `AUTOMATION.md`
- **Acceptance criteria:**
  - [ ] User submits PTO from tracker → Power Automate flow
  - [ ] Manager (Uchenna) gets Teams adaptive card
  - [ ] Approve/Reject buttons update entry status
  - [ ] User gets email confirmation
- **Depends on:** PTO-301

### 🟡 PTO-404: AI Trip Planner
- **Effort:** 1 week
- **Priority:** Medium
- **Files touched:** `index.html` (new modal + planning engine)
- **Acceptance criteria:**
  - [ ] "Plan a trip" button in Smart Suggestions
  - [ ] User inputs: dates or duration + number of days
  - [ ] Engine finds optimal PTO days considering holidays, WFH-Fridays, and existing bookings
  - [ ] Shows "PTO days needed" vs. "Total days off" ratio
  - [ ] One-click to book all suggested dates

### 🟡 PTO-405: Multi-employee mode
- **Effort:** 1 week
- **Priority:** Medium
- **Files touched:** Major refactor — introduce employee context
- **Acceptance criteria:**
  - [ ] Multiple employee profiles in one tracker instance
  - [ ] Employee switcher in sidebar
  - [ ] Each profile has own entries, allotments, hire date
  - [ ] "Team" summary view aggregates all profiles

### 🟢 PTO-406: Weather-aware suggestions
- **Effort:** 5 days
- **Priority:** Low
- **Files touched:** `index.html` (new API integration)
- **Acceptance criteria:**
  - [ ] Optional API integration with OpenWeatherMap or similar
  - [ ] Suggestions ranked by best-weather months for given lat/long
  - [ ] User enters location once in Settings

### 🟢 PTO-407: Cost calculator
- **Effort:** 3 days
- **Priority:** Low
- **Files touched:** `index.html` (Settings + new insight)
- **Acceptance criteria:**
  - [ ] Optional hourly rate input in Settings
  - [ ] Insight card: "Your remaining vacation is worth $X"
  - [ ] Trip planner shows PTO opportunity cost per suggestion

### 🟢 PTO-408: Native iOS/Android app
- **Effort:** 2 weeks
- **Priority:** Low
- **Files touched:** New Capacitor project wrapping the PWA
- **Acceptance criteria:**
  - [ ] Capacitor wrapper builds .ipa and .apk
  - [ ] Push notifications for anniversaries and PH deadline
  - [ ] Local notifications for use-it-or-lose-it alerts
  - [ ] Face ID / biometric lock option
- **Depends on:** PTO-103 (PWA foundation)

---

## 🐛 Known Issues / Tech Debt

| ID | Description | Severity |
|---|---|:-:|
| BUG-01 | Chart re-renders on every refresh even when data unchanged (perf) | Low |
| BUG-02 | Personal Holiday migration edge case if user manually deletes log entry | Medium |
| DEBT-01 | Massive single-file architecture — consider splitting for maintainability | Low |
| DEBT-02 | No automated tests — add a lightweight test file with core flows | Medium |
| DEBT-03 | Chart.js CDN dependency — could inline for true offline support | Low |

---

## 💡 Ideas Parking Lot (Not Prioritized)

- Voice input: "Add sick day today" via Web Speech API
- Auto-complete common notes ("Doctor appt", "Dental cleaning")
- Emoji reactions per entry (☀️ for great vacation, 🤒 for bad sick day)
- Yearly retrospective auto-generated on Dec 31
- Shareable read-only public link (obfuscated URL)
- Import from Outlook calendar (parse OOO entries)
- Import from Excel spreadsheet (drop the .xlsx → auto-parse)
- Multi-language support (Spanish for CCCI's Latin operations)
- Vacation goal tracking ("Take 15 days this year")
- Random vacation suggestion generator ("Book a random Friday off!")

---

## ✅ Shipped

### v1.2 — Log search & filter (July 2026)
- **PTO-101** — Search + filter for the Time Off Log. Toolbar search input (icon + clear button) matching date, type, status, notes, day-of-week, and month name (case-insensitive, 150ms debounced via `getFilteredEntries()`); type and auto-populated year filter dropdowns that stack with search; count reads "X of Y entries" when filtered; filter state persists to `state.logSearch`/`logType`/`logYear` (migration-safe defaults added to `load()`); `Ctrl/Cmd + K` focuses search on the Log tab. Verified end-to-end in Chromium.

### v1.1 — Calendar rescheduling (July 2026)
- **PTO-302** — Drag-to-reschedule entries on calendar. Drag any entry tag to a new day; drop targets highlight blue (valid) / red (invalid); weekends, company holidays, and already-occupied days are blocked with a reason toast; Personal Holiday moves stay synced to the tracker; a full `refresh()` propagates the move to the dashboard KPIs, projection chart, Time Off Log, upcoming widget, and insights. Verified end-to-end in Chromium.

### v1.0 — Initial release (July 2026)
- Dashboard KPIs (vacation/used/sick/refill)
- Time Off Log CRUD with edit modal
- Calendar month view with color-coded cells
- Balance projection chart (rolling 12-month with annotations)
- Usage breakdown doughnut chart
- Upcoming time off widget
- Personal Holiday tracker (with 90-day eligibility)
- Smart Suggestions engine (WFH-Friday aware)
- 8+ personalized insights (under-usage, cap, milestones)
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
- `PTO_Command_Center_Pitch.docx` — executive pitch document
- `PTO_Weekly_Digest.html` — companion email generator
- Future: `SETUP_SHAREPOINT.md`, `AUTOMATION.md`, `POWERBI_SETUP.md`, `TESTING.md`

---

_Last updated: July 7, 2026_
_Next review: End of Q3 2026_
