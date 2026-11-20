// The last font of the Analyze tab, so that the tab opens it again.

const LAST_FONT_KEY = 'fa:lastAnalyzedFont';

export function readLastFont(): string | null {
  try {
    return localStorage.getItem(LAST_FONT_KEY);
  } catch {
    return null;
  }
}

export function writeLastFont(id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_FONT_KEY, id);
    else localStorage.removeItem(LAST_FONT_KEY);
  } catch {
    // Storage can be blocked (private mode). The tab then opens empty, as before.
  }
}
