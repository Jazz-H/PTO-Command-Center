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
  const d = new Date(s); if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
export function normImportType(s){ const k = String(s||"").trim().toLowerCase(); const map = {pto:"PTO", vacation:"PTO", vac:"PTO", personal:"PTO", sick:"Sick", "personal holiday":"Personal Holiday", holiday:"Personal Holiday", ph:"Personal Holiday", bereavement:"Bereavement", jury:"Jury Duty", "jury duty":"Jury Duty", unpaid:"Unpaid"}; return map[k] || (s ? String(s).trim() : "PTO"); }

// ── Ingest normalized rows into state.entries, de-duping on date|type|hours.
//    Returns {added, dup, bad}; added=-1 signals an unrecognized format. ──
export function ingestEntryRows(rows){
  if (!rows || !rows.length) return {added:-1};
  const header = rows[0].map(h => String(h||"").trim().toLowerCase());
  const col = n => header.indexOf(n);
  let iDate = col("date"), iType = col("type"), iHours = col("hours"), iStatus = col("status"), iNotes = col("notes");
  let start = 1;
  if (iDate < 0 && iType < 0){ // no recognizable header → assume positional Date,[Day],Type,Hours,Status,Notes
    if (rows[0].length >= 5){ const hasDay = rows[0].length >= 6; iDate = 0; iType = hasDay?2:1; iHours = hasDay?3:2; iStatus = hasDay?4:3; iNotes = hasDay?5:4; start = 0; }
    else return {added:-1};
  }
  if (iDate < 0) return {added:-1};
  const wd = state.config.workday || 8;
  const existing = new Set(state.entries.map(e => `${e.date}|${e.type}|${Number(e.hours)}`));
  let added = 0, dup = 0, bad = 0;
  for (let r = start; r < rows.length; r++){
    const row = rows[r]; if (!row || !row.some(c => String(c==null?"":c).trim() !== "")) continue; // blank row
    const date = normImportDate(row[iDate]); if (!date){ bad++; continue; }
    const type = normImportType(iType >= 0 ? row[iType] : "PTO");
    let hours = iHours >= 0 ? parseFloat(row[iHours]) : wd; if (!(hours > 0)) hours = wd;
    const status = (iStatus >= 0 && row[iStatus] ? String(row[iStatus]).trim() : "Scheduled");
    const notes = iNotes >= 0 ? String(row[iNotes]||"").trim() : "";
    const key = `${date}|${type}|${hours}`; if (existing.has(key)){ dup++; continue; }
    existing.add(key); state.entries.push({date, type, hours, status, notes}); added++;
  }
  return {added, dup, bad};
}
