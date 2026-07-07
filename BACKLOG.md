# 📋 PTO Command Center — Backlog Checklist v2

> Quick-reference checklist for Claude Code. Full details in `ROADMAP.md`.
> **v2** adds 5 user-requested items (PTO-501 through PTO-505) at top of Tier 1.
> **Reconciled July 7, 2026** to reflect work shipped this cycle (v1.1 → v1.4).

## 🆕 v2 User-Requested (Prioritized)

- [x] **PTO-501** Dashboard: Friday activities + dismissable insights + drill-downs · 3h · 🔥 Critical — ✅ shipped v1.5
- [x] **PTO-502** Expand drag-to-reschedule to Friday appts + suggestions · 3h · 🔥 Critical — ✅ shipped v1.6
- [x] **PTO-503** Time Off Log: Hours/Days/Range toggle + polished picker · 4h · 🔥 Critical — ✅ shipped v1.7
- [x] **PTO-504** Smart Suggestions: expanded intelligence categories · 2d · 🔥 Critical — ✅ subset shipped v1.9 (remaining categories → PTO-504b)
- [x] **PTO-505** Polished sidebar collapse button · 2h · 🟡 High — ✅ shipped v1.8

## 🚀 Tier 1 — Original Quick Wins

- [x] **PTO-101** Search + filter for Time Off Log · 2h · 🔴 Critical — ✅ shipped v1.2
- [x] **PTO-102** iCal (.ics) export · 3h · 🔴 Critical — ✅ shipped v1.10
- [x] **PTO-103** PWA manifest + service worker · 4h · 🔴 Critical — ✅ shipped v1.14
- [x] **PTO-104** Month-grouped Log view · 3h · 🟡 High — ✅ shipped v1.3
- [x] **PTO-105** Slash-command search · 2h · 🟢 Medium — ✅ shipped v1.12
- [x] **PTO-201** Custom favicon + splash · 1h · 🟢 Low — ✅ shipped v1.13
- [x] **PTO-202** Print-friendly stylesheet · 2h · 🟢 Low — ✅ shipped v1.15

## 🚧 Tier 2 — Medium Effort

- [ ] **PTO-301** SharePoint List backend for multi-device sync · 2d · 🔴 Critical
- [x] **PTO-302** Drag-to-reschedule base · 6h · 🔴 Critical — ✅ shipped v1.1
- [ ] **PTO-303** Power Automate weekly digest flow · 1d · 🔴 Critical
- [ ] **PTO-304** Personal Holiday reminder email · 4h · 🟡 High
- [ ] **PTO-305** Year-over-year usage comparison chart · 6h · 🟡 Medium
- [ ] **PTO-306** Team calendar overlay · 2d · 🟡 Medium
- [x] **PTO-307** CSV export · 3h · 🟡 Medium — ✅ shipped v1.11
- [ ] **PTO-308** Anniversary celebration email · 3h · 🟢 Low

## 🎢 Tier 3 — Strategic

- [ ] **PTO-401** Power BI dashboard · 3d · 🔴 Critical
- [ ] **PTO-402** Osapiens / CONA integration · 2w · 🔴 High
- [ ] **PTO-403** Approval workflow via Teams · 1w · 🟡 High
- [ ] **PTO-404** AI Trip Planner · 1w · 🟡 Medium
- [ ] **PTO-405** Multi-employee mode · 1w · 🟡 Medium
- [ ] **PTO-406** Weather-aware suggestions · 5d · 🟢 Low
- [ ] **PTO-407** Cost calculator · 3d · 🟢 Low
- [ ] **PTO-408** Native iOS/Android app · 2w · 🟢 Low

## 🐛 Bugs & Tech Debt

- [ ] **BUG-01** Chart re-renders on every refresh (perf)
- [ ] **BUG-02** PH migration edge case if user manually deletes log entry
- [x] **BUG-03** Sidebar collapse button cut off in dark mode — ✅ fixed in PTO-505 (v1.8)
- [ ] **DEBT-01** Split monolithic HTML into multiple files
- [ ] **DEBT-02** Add lightweight test file with core flows
- [ ] **DEBT-03** Inline Chart.js for true offline support

## ✅ Shipped this cycle (not in original backlog)

- [x] **Responsive / mobile layout** — off-canvas drawer, fitted calendar, scrollable tables · ✅ v1.4
- [x] **QA/UAT polish** — fixed narrow-width (≤320px) overflow across all tabs · ✅ v1.4

## 🎯 Recommended v2 Sprint Order

**Sprint 1 (~10h):** PTO-505 → PTO-201 → PTO-501 → ~~PTO-101~~ ✅ → PTO-102 (start)
**Sprint 2 (~11h):** PTO-503 → PTO-502 → ~~PTO-104~~ ✅ → PTO-103 (finish)
**Sprint 3 (~8h):** PTO-504 (start) → PTO-105 → PTO-202
