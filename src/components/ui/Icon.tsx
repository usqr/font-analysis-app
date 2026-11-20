// Line icons from the OpenDesign mocks (24 × 24, stroke 1.6).
const PATHS = {
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  compare: <><rect x="3.5" y="5" width="7" height="14" rx="1" /><rect x="13.5" y="5" width="7" height="14" rx="1" /></>,
  chev: <path d="M6 9l6 6 6-6" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  filters: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></>,
  list: <path d="M5 7h14M5 12h14M5 17h14" />,
  grid: <><rect x="4.5" y="4.5" width="6" height="6" rx="1" /><rect x="13.5" y="4.5" width="6" height="6" rx="1" /><rect x="4.5" y="13.5" width="6" height="6" rx="1" /><rect x="13.5" y="13.5" width="6" height="6" rx="1" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.01" /></>,
  upload: <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  collapse: <><path d="M10 7l5 5-5 5" /><path d="M19 5v14" /></>,
  compareEmpty: <><path d="M3 18h18M3 6h18" strokeDasharray="2 2" /><path d="M6 18l3.5-10L13 18M7.3 14.5h4.4M15 18v-6m0 1.2c.6-1 1.5-1.4 2.5-1.4 1.6 0 2.5 1.2 2.5 3.1S19.1 18 17.5 18c-1 0-1.9-.4-2.5-1.4" /></>,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = '', strokeWidth = 1.6 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg
      className={`od-icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
