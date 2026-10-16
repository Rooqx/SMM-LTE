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
  monday: 0, mon: 0,
  tuesday: 1, tue: 1, tues: 1,
  wednesday: 2, wed: 2,
  thursday: 3, thu: 3, thur: 3, thurs: 3,
  friday: 4, fri: 4,
  saturday: 5, sat: 5,
  sunday: 6, sun: 6,
};

function normalizedPlatform(value: string): string {
  const name = value.toLowerCase().trim();
  if (/\blinkedin\b/.test(name)) return "linkedin";
  if (/\b(twitter|x)\b/.test(name)) return "x";
  if (/\binstagram\b/.test(name)) return "instagram";
  if (/\bfacebook\b/.test(name)) return "facebook";
  if (/\btiktok\b/.test(name)) return "tiktok";
  if (/\byoutube\b/.test(name)) return "youtube";
  if (/\bthreads\b/.test(name)) return "threads";
  if (/\bbluesky\b/.test(name)) return "bluesky";
  return name.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function parseDateAsUtc(value: string): Date | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== trimmed ? null : d;
  }
  const d = new Date(trimmed.includes("UTC") ? trimmed : `${trimmed} UTC`);
  if (!Number.isNaN(d.getTime())) return d;
  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function calendarMonday(markdown: string): Date | null {
  const match = /(?:week of|starting|start date|period|week starting|week)\s*[:* -]*\s*(?:(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)[,\s]+)?([a-z]+\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2})/i.exec(markdown);
  if (!match) return null;
  const parsed = parseDateAsUtc(match[1]!);
  if (!parsed) return null;
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
    const header = cells.map((cell) => cell.toLowerCase().replace(/[*_`]/g, ""));
    const dayIdx = header.findIndex((cell) => /\b(day|date|weekday|when)\b/i.test(cell));
    const platformIdx = header.findIndex((cell) => /\b(platform|platforms|channel|channels|network|networks|social)\b/i.test(cell));
    const topicIdx = header.findIndex((cell) => /\b(topic|angle|theme|content|post|concept|hook|idea|subject|description|title)\b/i.test(cell));
    if (dayIdx !== -1 && platformIdx !== -1 && topicIdx !== -1) {
      columns = {
        day: dayIdx,
        platform: platformIdx,
        topic: topicIdx,
        format: header.findIndex((cell) => /\b(format|type|media|asset|style)\b/i.test(cell)),
      };
      continue;
    }
    if (!columns) continue;
    const dayCell = (cells[columns.day] ?? "").replace(/[*_`]/g, "");
    if (/\b(open|flexible|tbd|buffer|reserve)\b/i.test(dayCell)) continue;

    const dayNameMatch = dayCell.toLowerCase().match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/)?.[1];
    let dayOffset: number | null = null;
    if (dayNameMatch && dayNameMatch in DAYS) {
      dayOffset = DAYS[dayNameMatch]!;
    }
    const explicitDate = /\b\d{4}-\d{2}-\d{2}\b/.exec(dayCell)?.[0];
    const date = new Date(monday);
    if (explicitDate) {
      const parsed = new Date(`${explicitDate}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime()) ||
          parsed.toISOString().slice(0, 10) !== explicitDate) {
        throw new Error("Calendar row date does not match its weekday");
      }
      if (dayOffset !== null) {
        const expectedDay = (parsed.getUTCDay() + 6) % 7;
        if (expectedDay !== dayOffset) {
          throw new Error("Calendar row date does not match its weekday");
        }
      } else {
        dayOffset = (parsed.getUTCDay() + 6) % 7;
      }
      date.setTime(parsed.getTime());
    } else if (dayOffset !== null) {
      date.setUTCDate(date.getUTCDate() + dayOffset);
    } else {
      continue;
    }

    const platform = normalizedPlatform(cells[columns.platform] ?? "");
    let topic = (cells[columns.topic] ?? "").replace(/^[*_`]+|[*_`]+$/g, "").trim();
    if (!platform || !topic) {
      throw new Error("Every dated calendar row needs a platform and a topic of at most 240 characters");
    }
    if (topic.length > 240) {
      topic = topic.slice(0, 237).trim() + "...";
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
