// Small inline icons for the top bar (no icon font, no network).
const common = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, focusable: false };

export const SearchIcon = () => <svg {...common}><circle cx="7" cy="7" r="4.6" /><path d="M10.4 10.4L14 14" /></svg>;
export const ListIcon = () => <svg {...common}><path d="M5.5 4h8M5.5 8h8M5.5 12h8" /><circle cx="2.6" cy="4" r=".6" /><circle cx="2.6" cy="8" r=".6" /><circle cx="2.6" cy="12" r=".6" /></svg>;
export const MapIcon = () => <svg {...common}><path d="M1.8 4.2L5.6 2.4l4.8 1.8 3.8-1.8v9.4l-3.8 1.8-4.8-1.8-3.8 1.8z" /><path d="M5.6 2.4v9.4M10.4 4.2v9.4" /></svg>;
export const GearIcon = () => (
  <svg {...common}>
    <path d="M13.02 6.65L15.21 6.86L15.21 9.14L13.02 9.35L12.50 10.60L13.91 12.29L12.29 13.91L10.60 12.50L9.35 13.02L9.14 15.21L6.86 15.21L6.65 13.02L5.40 12.50L3.71 13.91L2.09 12.29L3.50 10.60L2.98 9.35L0.79 9.14L0.79 6.86L2.98 6.65L3.50 5.40L2.09 3.71L3.71 2.09L5.40 3.50L6.65 2.98L6.86 0.79L9.14 0.79L9.35 2.98L10.60 3.50L12.29 2.09L13.91 3.71L12.50 5.40Z" />
    <circle cx="8" cy="8" r="2.1" />
  </svg>
);
export const InfoIcon = () => <svg {...common}><circle cx="8" cy="8" r="6.2" /><path d="M8 7.2v4M8 4.8v.2" /></svg>;
export const CalendarIcon = () => <svg {...common}><rect x="2" y="3" width="12" height="11" rx="1.6" /><path d="M2 6.6h12M5.2 1.6v2.8M10.8 1.6v2.8" /><path d="M5 9.4h1.4M7.4 9.4h1.4M9.8 9.4h1.4M5 11.8h1.4M7.4 11.8h1.4" /></svg>;
