/* Pure date & calendar utilities — no app state. */
export const DAYNAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
export const DOWABBR = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export const MONTHNAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export function parseDate(s){ if(!s) return null; const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
export function fmt(d, opts){ return d.toLocaleDateString("en-US", opts||{month:"short",day:"numeric",year:"numeric"}); }
export function isoDate(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), dd=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${dd}`; }
export function today(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
export function isWeekend(d){ const w = d.getDay(); return w===0||w===6; }
export function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
export function daysBetween(a,b){ return Math.round((b-a)/86400000); }
export function weekNum(d){ const j=new Date(d.getFullYear(),0,1); return Math.ceil((((d-j)/86400000)+j.getDay()+1)/7); }
export function ordSuffix(n){ const s=["th","st","nd","rd"], v=n%100; return s[(v-20)%10]||s[v]||s[0]; }
