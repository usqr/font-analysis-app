/**
 * True in the GitHub Pages build (`VITE_STATIC=1`). That build has no Express
 * server: it shows the Google Fonts set only, and folder scans, uploads and
 * other disk actions are hidden.
 */
export const IS_STATIC = import.meta.env.VITE_STATIC === '1';
