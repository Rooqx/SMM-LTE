/**
 * Converts an approved calendar table into a finite, backend-owned worklist.
 * Flexible "Open" ideas are not dated commitments and are deliberately skipped.
 */
export type CalendarSlot = Readonly<{
  key: string;
  localDate: string;
  platform: string;
  topic: string;
  format: string;
}>;

const DAYS: Readonly<Record<string, number>> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4,
  saturday: 5, sunday: 6,
};

function normalizedPlatform(value: string): string {
  const name = value.toLowerCase().trim();
  if (/\blinkedin\b/.test(name)) return "linkedin";
  if (/\b(twitter|x)\b/.test(name)) return "x";
  if (/\binstagram\b/.test(name)) return "instagram";
  if (/\bfacebook\b/.test(name)) return "facebook";
  if (/\btiktok\b/.test(name)) return "tiktok";
  return name.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function calendarMonday(markdown: string): Date | null {
  const match = /(?:week of|starting|start date|period)\s*[:* -]*\s*([a-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i.exec(markdown);
  if (!match) return null;
  const parsed = new Date(match[1]!);
  if (Number.isNaN(parsed.getTime()) ||
      (/^\d{4}-\d{2}-\d{2}$/.test(match[1]!) &&
        parsed.toISOString().slice(0, 10) !== match[1])) return null;
  const monday = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  return monday;
}

export function parseCalendarSlots(calendarId: string, markdown: string): CalendarSlot[] {
  const monday = calendarMonday(markdown);
  if (!monday) throw new Error("Calendar needs a dated 'Week of <date>' heading");
  const lines = markdown.split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
  let columns: { day: number; platform: number; topic: number; format: number } | null = null;
  const slots: CalendarSlot[] = [];
  for (const line of lines) {
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
    const header = cells.map((cell) => cell.toLowerCase());
    if (header.some((cell) => cell.startsWith("day")) && header.includes("platform") && header.some((cell) => cell.includes("topic"))) {
      columns = {
        day: header.findIndex((cell) => cell.startsWith("day")),
        platform: header.indexOf("platform"),
        topic: header.findIndex((cell) => cell.includes("topic")),
        format: header.indexOf("format"),
      };
      continue;
    }
    if (!columns) continue;
    const dayCell = cells[columns.day] ?? "";
    const dayName = dayCell.toLowerCase().match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)?.[1];
    if (!dayName) continue;
    const platform = normalizedPlatform(cells[columns.platform] ?? "");
    const topic = cells[columns.topic]?.trim() ?? "";
    if (!platform || !topic || topic.length > 240) {
      throw new Error("Every dated calendar row needs a platform and a topic of at most 240 characters");
    }
    const date = new Date(monday);
    date.setUTCDate(date.getUTCDate() + DAYS[dayName]!);
    const explicitDate = /\b\d{4}-\d{2}-\d{2}\b/.exec(dayCell)?.[0];
    if (explicitDate) {
      const parsed = new Date(`${explicitDate}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime()) ||
          parsed.toISOString().slice(0, 10) !== explicitDate ||
          parsed.getUTCDay() !== date.getUTCDay()) {
        throw new Error("Calendar row date does not match its weekday");
      }
      date.setTime(parsed.getTime());
    }
    slots.push({
      key: `cal-${calendarId.replaceAll("-", "")}-${slots.length + 1}`,
      localDate: date.toISOString().slice(0, 10),
      platform,
      topic,
      format: (columns.format >= 0 ? cells[columns.format] : undefined) || "post",
    });
    // The QC steps load a bounded artifact snapshot (60 records). Leave room
    // for score/edit artifacts alongside every scheduled draft.
    if (slots.length > 47) throw new Error("Calendar exceeds the 47-post batch limit");
  }
  if (slots.length === 0) throw new Error("Calendar has no dated platform/topic rows");
  return slots;
}

/** On-demand extras skip Phase 2, so their owner brief is the slot authority. */
export function extraPostSlots(briefRevisionId: string, brief: Record<string, unknown>): CalendarSlot[] {
  const quantity = brief.quantity;
  const platforms = brief.platforms;
  const date = brief.publicationDate;
  const topic = brief.topic;
  if (!Number.isInteger(quantity) || Number(quantity) < 1 || Number(quantity) > 47 ||
      !Array.isArray(platforms) || platforms.length === 0 ||
      platforms.some((platform) => typeof platform !== "string" ||
        !/^[a-z0-9-]{1,40}$/.test(platform)) ||
      typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      typeof topic !== "string" || !topic.trim() || topic.length > 240) {
    throw new Error("Extra-post brief is missing a valid quantity, platform, date, or topic");
  }
  return Array.from({ length: Number(quantity) }, (_, index) => ({
    key: `extra-${briefRevisionId.replaceAll("-", "")}-${index + 1}`,
    localDate: date,
    platform: String(platforms[index % platforms.length]),
    topic: topic.trim(),
    format: "post",
  }));
}
