type RuntimeRow = Record<string, unknown>;

// jobs.list and schedules.list answer one page: 100 rows unless a limit is
// given, at most 1,000, newest first. On 2026-09-11 newer bridge timers pushed
// every MoonSleep commerce job off that default page, so name lookups saw them
// as missing. The runtime also drops internal definitions after it applies the
// limit, so a short page is not the end of the list: read until an empty page.
// A list that has not ended within the bound fails closed instead of reading as
// complete, because the install hook creates whatever it does not find.
export const NEX_LIST_PAGE_SIZE = 1_000;
export const NEX_LIST_MAX_PAGES = 20;

const LIST_KEYS = Object.freeze({ "jobs.list": "jobs", "schedules.list": "schedules" });

export async function listEveryPage(
  operation: keyof typeof LIST_KEYS,
  readPage: (page: { limit: number; offset: number }) => Promise<RuntimeRow>,
): Promise<RuntimeRow[]> {
  const key = LIST_KEYS[operation];
  const rows: RuntimeRow[] = [];
  for (let page = 0; page < NEX_LIST_MAX_PAGES; page += 1) {
    const entries = (
      await readPage({ limit: NEX_LIST_PAGE_SIZE, offset: page * NEX_LIST_PAGE_SIZE })
    )[key];
    if (!Array.isArray(entries)) {
      throw new Error(`Nex ${operation} did not return a ${key} list`);
    }
    if (entries.length === 0) {
      return rows;
    }
    for (const entry of entries) {
      if (entry && typeof entry === "object" && !Array.isArray(entry)) {
        rows.push(entry as RuntimeRow);
      }
    }
  }
  throw new Error(`Nex ${operation} reached its page bound`);
}
