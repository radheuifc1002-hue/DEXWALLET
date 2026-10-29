const HISTORY_KEY = "xu_browser_history";
const MAX_HISTORY = 50;

export interface HistoryEntry {
  name: string;
  url: string;
  visitedAt: number;
}

export const getHistory = (): HistoryEntry[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
};

export const addToHistory = (entry: { name: string; url: string }) => {
  try {
    const existing = getHistory().filter((h) => h.url !== entry.url);
    const updated: HistoryEntry[] = [
      { ...entry, visitedAt: Date.now() },
      ...existing,
    ].slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  } catch {}
};

export const clearHistory = () => {
  localStorage.removeItem(HISTORY_KEY);
};

export const formatTimeAgo = (ts: number): string => {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
};
