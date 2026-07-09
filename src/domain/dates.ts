/* Pure date & calendar utilities — no app state. */
export const DAYNAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
export const DOWABBR = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export const MONTHNAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export function parseDate(s: string): Date | null { if(!s) return null; const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
export function fmt(d: Date, opts?: Intl.DateTimeFormatOptions): string { return d.toLocaleDateString("en-US", opts||{month:"short",day:"numeric",year:"numeric"}); }
export function isoDate(d: Date): string { const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), dd=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${dd}`; }
export function today(): Date { const d=new Date(); d.setHours(0,0,0,0); return d; }
export function isWeekend(d: Date): boolean { const w = d.getDay(); return w===0||w===6; }
export function addDays(d: Date, n: number): Date { const x=new Date(d); x.setDate(x.getDate()+n); return x; }
export function daysBetween(a: Date, b: Date): number { return Math.round((b.getTime()-a.getTime())/86400000); }
export function weekNum(d: Date): number { const j=new Date(d.getFullYear(),0,1); return Math.ceil((((d.getTime()-j.getTime())/86400000)+j.getDay()+1)/7); }
export function ordSuffix(n: number): string { const s=["th","st","nd","rd"], v=n%100; return s[(v-20)%10]||s[v]||s[0]; }
