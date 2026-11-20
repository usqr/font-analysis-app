/**
 * True in the GitHub Pages build (`VITE_STATIC=1`). That build has no Express
 * server: it shows the Google Fonts set only, and folder scans and other disk
 * actions are hidden. A font upload works, because the browser parses the file.
 */
export const IS_STATIC = import.meta.env.VITE_STATIC === '1';
