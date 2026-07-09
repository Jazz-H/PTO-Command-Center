/* Ambient declarations for CDN-loaded globals and non-standard platform APIs. */

// Chart.js is loaded from a CDN <script>, not imported — it's a global constructor.
declare const Chart: any;

interface Window {
  XLSX?: any;          // SheetJS, lazy-loaded from a CDN for .xlsx import
  MSStream?: unknown;  // legacy IE/Edge sniff used in the iOS PWA check
}

interface Navigator {
  standalone?: boolean; // iOS Safari: true when launched from the home screen
}
