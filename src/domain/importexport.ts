/* Import/export primitives — pure serializers and parsers.
   No DOM writes, no toast/refresh: the app.ts orchestrators own the file
   I/O and user feedback; this module just turns data <-> text/rows. */
import { state } from "../state/store.ts";

// ── iCalendar (.ics) escaping / line folding ──
export function icsEscape(s){ return String(s==null?"":s).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\r?\n/g,"\\n"); }
export function icsFold(line){ if (line.length <= 74) return line; let out = "", s = line; while (s.length > 74){ out += s.slice(0,74) + "\r\n "; s = s.slice(74); } return out + s; }

// ── CSV cell quoting ──
export function csvCell(s){ s = String(s==null?"":s); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s; }

// ── Parsers: CSV text and HTML-table (our .xls export) into row arrays ──
export function parseCSVText(text){
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++){ const ch = text[i];
    if (q){ if (ch === '"'){ if (text[i+1] === '"'){ cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ','){ row.push(cell); cell = ""; }
    else if (ch === '\n'){ row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch === '\r'){ /* skip */ }
    else cell += ch;
  }
  if (cell.length || row.length){ row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}
export function parseHtmlTable(html){
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll("tr")].map(tr => [...tr.querySelectorAll("th,td")].map(td => td.textContent.trim()));
}

// ── Value normalizers ──
export function normImportDate(v){
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,"0")}-${String(v.getDate()).padStart(2,"0")}`;
  let s = String(v==null?"":v).trim(); if (!s) return null;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)){ const [y,m,d] = s.split("-").map(Number); return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
  // Excel serial date (days since 1899-12-30); modern dates are ~20000–80000
  if (/^\d{4,6}(\.\d+)?$/.test(s)){ const n = Number(s); if (n >= 20000 && n < 80000){ const dt = new Date(Date.UTC(1899,11,30) + Math.round(n)*86400000); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,"0")}-${String(dt.getUTCDate()).padStart(2,"0")}`; } }
  // Numeric M/D/Y or D/M/Y (slash, dash, or dot separators; 2- or 4-digit year).
  // Disambiguate month vs day by which part can't be a month (>12); otherwise
  // assume month-first (US / Excel default).
  const mdy = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (mdy){
    let a = +mdy[1], b = +mdy[2], y = +mdy[3];
    if (y < 100) y += y < 70 ? 2000 : 1900;
    let mo = a, dy = b;
    if (a > 12 && b <= 12){ dy = a; mo = b; }   // first part can't be a month → day-first
    if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) return `${y}-${String(mo).padStart(2,"0")}-${String(dy).padStart(2,"0")}`;
  }
  // Named-month formats: normalize "9-Jul-2026" → "9 Jul 2026" so Date can parse it.
  const d = new Date(/[a-z]/i.test(s) ? s.replace(/[-/]/g, " ") : s); if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
export function normImportType(s){ const k = String(s||"").trim().toLowerCase(); const map = {pto:"PTO", vacation:"PTO", vac:"PTO", personal:"PTO", ooo:"PTO", "out of office":"PTO", sick:"Sick", "out sick":"Sick", oos:"Sick", "personal holiday":"Personal Holiday", holiday:"Personal Holiday", ph:"Personal Holiday", "work event":"Work Event", conference:"Work Event", offsite:"Work Event", "off-site":"Work Event", "work travel":"Work Event", "business travel":"Work Event", "business trip":"Work Event", volunteer:"Work Event", training:"Work Event", bereavement:"Bereavement", jury:"Jury Duty", "jury duty":"Jury Duty", unpaid:"Unpaid", other:"Other", misc:"Other"}; return map[k] || (s ? String(s).trim() : "PTO"); }

// ── Ingest normalized rows into state.entries, de-duping on date|type|hours.
//    Returns {added, dup, bad}; added=-1 signals an unrecognized format. ──
export function ingestEntryRows(rows){
  if (!rows || !rows.length) return {added:-1};
  const norm = s => String(s==null?"":s).trim().toLowerCase();
  // Match a header cell by substring against any of the given aliases.
  const findCol = (hdr, ...names) => hdr.findIndex(h => names.some(n => h === n || h.includes(n)));
  // Locate the real header row — files often lead with title/name/blank preamble
  // rows before the column headers, so we can't assume it's row 0.
  let headerIdx = -1, header = null;
  for (let i = 0; i < Math.min(rows.length, 15); i++){
    const h = rows[i].map(norm);
    if (findCol(h, "start date", "date", "start") >= 0){ headerIdx = i; header = h; break; }
  }
  if (headerIdx < 0) return {added:-1};
  const iDate   = findCol(header, "start date", "date", "start");
  const iEnd    = findCol(header, "end date", "end");
  const iHours  = findCol(header, "hours", "hrs");
  const iDays   = findCol(header, "of days", "# days", "num days");   // days count → hours via workday
  const iType   = findCol(header, "type");
  const iStatus = findCol(header, "status");
  const iNotes  = findCol(header, "notes", "coverage", "comment");
  if (iDate < 0) return {added:-1};
  const wd = state.config.workday || 8;
  const existing = new Set(state.entries.map(e => `${e.date}|${e.type}|${Number(e.hours)}`));
  let added = 0, dup = 0, bad = 0;
  for (let r = headerIdx + 1; r < rows.length; r++){
    const row = rows[r]; if (!row) continue;
    if (norm(row[iDate]) === "") continue;                             // no date value → not a data row (trailer/summary), skip
    const date = normImportDate(row[iDate]); if (!date){ bad++; continue; }
    const type = normImportType(iType >= 0 ? row[iType] : "PTO");
    let hours;
    if (iHours >= 0 && norm(row[iHours]) !== "") hours = parseFloat(row[iHours]);
    else if (iDays >= 0 && norm(row[iDays]) !== "") hours = parseFloat(row[iDays]) * wd;
    if (!(hours > 0)) hours = wd;
    const status = (iStatus >= 0 && row[iStatus] ? String(row[iStatus]).trim() : "Scheduled");
    let notes = iNotes >= 0 ? String(row[iNotes]||"").trim() : "";
    // Preserve a multi-day range as a note (entries are single-date).
    if (iEnd >= 0){ const end = normImportDate(row[iEnd]); if (end && end !== date) notes = (notes ? notes + " " : "") + `(through ${end})`; }
    const key = `${date}|${type}|${hours}`; if (existing.has(key)){ dup++; continue; }
    existing.add(key); state.entries.push({date, type, hours, status, notes}); added++;
  }
  return {added, dup, bad};
}
