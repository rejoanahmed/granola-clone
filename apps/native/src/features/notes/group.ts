import { dayKey, deviceTimeZone } from "./format";

export type DaySection<T> = {
  readonly data: T[];
  /** The local date, `yyyy-mm-dd`. */
  readonly key: string;
  /** The first row's start, which is all a day header needs to format itself. */
  readonly startedAt: number;
};

// Only consecutive rows are grouped: the API's order (startedAt desc, then id desc) is already the
// list's, so a day split across two pages extends one section instead of repeating its header.
export function groupByDay<T extends { readonly startedAt: number }>(
  items: readonly T[],
  timeZone: string = deviceTimeZone()
): DaySection<T>[] {
  const sections: DaySection<T>[] = [];
  for (const item of items) {
    const key = dayKey(item.startedAt, timeZone);
    const last = sections.at(-1);
    if (last?.key === key) {
      last.data.push(item);
    } else {
      sections.push({ data: [item], key, startedAt: item.startedAt });
    }
  }
  return sections;
}
