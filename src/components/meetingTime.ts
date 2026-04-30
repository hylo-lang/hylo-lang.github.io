import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

/**
 * Static configuration for the recurring Hylo developer meeting. Imported by
 * both `MeetingTime.astro`'s frontmatter and its client-side `<script>` so a
 * single source of truth survives both build-time rendering and runtime
 * updates.
 */
export const HYLO_MEETING = {
  /** Title shown in calendar entries. */
  name: "Hylo Developers' Meeting",
  /** Default human-readable label rendered before JS hydrates. */
  fallbackText: 'Developer Meetings on Tuesdays and Thursdays',
  /** Wall-clock start time, "HH:MM" 24-hour, in `timezone`. */
  startTime: '12:00',
  /** Wall-clock end time, "HH:MM" 24-hour, in `timezone`. */
  endTime: '13:00',
  /** IANA zone the wall-clock times are anchored to. */
  timezone: 'America/Los_Angeles',
  /** Weekdays (JS `Date.getDay()` convention: Sun = 0) on which the meeting recurs. */
  meetingDays: [2, 4] as const, // Tuesday, Thursday
  /**
   * RFC 5545 recurrence rule (without the `RRULE:` property name). Must
   * agree with `meetingDays` above; kept as a separate string because the
   * RFC syntax is not derivable from a JS weekday list without a small
   * mapping table that we'd never reuse anywhere else.
   */
  recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU,TH',
  /** Stable UID for the recurring event series; identifies it to calendar apps. */
  uid: 'hylo-developer-meeting-tu-th@hylo-lang.org',
} as const;

export interface ParsedTime {
  hours: number;
  minutes: number;
}

/** Parse a 24-hour "HH:MM" string. Throws on invalid input. */
export function parseTime(timeStr: string): ParsedTime {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid time format: ${timeStr}. Expected format: "HH:MM" (24-hour)`);
  }
  const hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid time values: ${timeStr}. Hours must be 0-23, minutes 0-59`);
  }
  return { hours, minutes };
}

/**
 * Day-of-week predicate matching JS `Date.getDay()` convention (Sunday = 0,
 * Saturday = 6). `meetingDays` is the set of weekday numbers on which the
 * meeting recurs.
 */
export function isMeetingDay(
  dayOfWeek: number,
  meetingDays: readonly number[],
): boolean {
  return meetingDays.includes(dayOfWeek);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Compute the next meeting date as a "yyyy-MM-dd" string in the given source
 * timezone, given the set of weekdays on which the meeting recurs.
 *
 * The computation is performed entirely in the source timezone using explicit
 * IANA conversions, so the result does NOT depend on the runtime's local
 * timezone (important when building on a server in UTC while the meeting is
 * defined in e.g. Europe/Amsterdam).
 *
 * If "today" in the source timezone is a meeting day and the meeting's start
 * time has not yet been reached, today is returned. Otherwise the next
 * meeting weekday (in source-TZ calendar days) is returned.
 */
export function getNextMeetingDate(
  now: Date,
  startTime: string,
  timezone: string,
  meetingDays: readonly number[],
): string {
  const { hours, minutes } = parseTime(startTime);
  const startHHMM = `${pad2(hours)}:${pad2(minutes)}:00`;

  const todayStr = formatInTimeZone(now, timezone, 'yyyy-MM-dd');

  // Probe up to 14 days ahead. That covers at least one full week even if a
  // DST transition causes two consecutive offsets to yield the same calendar
  // day in the source timezone.
  for (let offset = 0; offset < 14; offset++) {
    const probe = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const candidate = formatInTimeZone(probe, timezone, 'yyyy-MM-dd');
    // date-fns token 'i' = ISO day of week (1=Mon..7=Sun). Map to JS getDay() (Sun=0).
    const dow = parseInt(formatInTimeZone(probe, timezone, 'i')) % 7;

    if (!isMeetingDay(dow, meetingDays)) continue;

    // If the candidate is today, skip it when the meeting has already started.
    if (candidate === todayStr) {
      const meetingStartUTC = fromZonedTime(`${candidate}T${startHHMM}`, timezone);
      if (now.getTime() >= meetingStartUTC.getTime()) continue;
    }

    return candidate;
  }

  // Defensive fallback (should be unreachable when at least one meeting day
  // is provided: any weekday recurs within any 7-day window).
  return todayStr;
}

/** Convert a source-TZ "yyyy-MM-dd" + "HH:MM" wall-clock pair to a UTC instant. */
export function meetingInstant(
  meetingDate: string,
  time: string,
  timezone: string,
): Date {
  const { hours, minutes } = parseTime(time);
  return fromZonedTime(`${meetingDate}T${pad2(hours)}:${pad2(minutes)}:00`, timezone);
}

export interface MeetingDescription {
  /** Primary headline (unchanged from the caller-provided `title`). */
  title: string;
  /** Secondary line describing the next meeting in the user's timezone. */
  details: string;
}

export interface RenderMeetingInput {
  now: Date;
  /** Meeting date as "yyyy-MM-dd" in the source timezone. */
  meetingDate: string;
  /** Start wall-clock in the source timezone, "HH:MM". */
  startTime: string;
  /** End wall-clock in the source timezone, "HH:MM". */
  endTime: string;
  sourceTimezone: string;
  userTimeZone: string;
  title: string;
}

/**
 * Build the strings shown in the meeting-time UI, independent of any DOM.
 *
 * The `details` string uses:
 *   - "Today" / "Tomorrow" relative to the user's timezone (not the source TZ);
 *   - otherwise an absolute "MMMM d" date in the user's timezone;
 *   - a " (next day)" / " (previous day)" annotation when the meeting's
 *     user-TZ calendar day differs from its source-TZ calendar day;
 *   - a short user-TZ label (e.g. "Amsterdam") when the user is in a
 *     different timezone than the source.
 */
export function renderMeetingDescription(args: RenderMeetingInput): MeetingDescription {
  const utcStart = meetingInstant(args.meetingDate, args.startTime, args.sourceTimezone);
  const utcEnd = meetingInstant(args.meetingDate, args.endTime, args.sourceTimezone);

  const userStart = formatInTimeZone(utcStart, args.userTimeZone, 'h:mm a');
  const userEnd = formatInTimeZone(utcEnd, args.userTimeZone, 'h:mm a');

  const userMeetingDay = formatInTimeZone(utcStart, args.userTimeZone, 'yyyy-MM-dd');
  const userToday = formatInTimeZone(args.now, args.userTimeZone, 'yyyy-MM-dd');
  const userTomorrow = formatInTimeZone(
    new Date(args.now.getTime() + 24 * 60 * 60 * 1000),
    args.userTimeZone,
    'yyyy-MM-dd',
  );

  const dateLabel =
    userMeetingDay === userToday ? 'Today'
    : userMeetingDay === userTomorrow ? 'Tomorrow'
    : formatInTimeZone(utcStart, args.userTimeZone, 'MMMM d');

  const sameTz = args.userTimeZone === args.sourceTimezone;
  const tzLabel = sameTz ? '' : ` ${args.userTimeZone.split('/').pop() || args.userTimeZone}`;
  const dayNote =
    sameTz || userMeetingDay === args.meetingDate ? ''
    : userMeetingDay > args.meetingDate ? ' (next day)'
    : ' (previous day)';

  return {
    title: args.title,
    details: `Next meeting: ${dateLabel}, ${userStart}–${userEnd}${tzLabel}${dayNote}`,
  };
}

export interface CalendarEvent {
  /** First-occurrence date "yyyy-MM-dd" in `timezone`. Must satisfy `recurrenceRule`. */
  meetingDate: string;
  /** Start wall-clock "HH:MM" in `timezone`. */
  startTime: string;
  /** End wall-clock "HH:MM" in `timezone`. */
  endTime: string;
  /** IANA timezone the wall-clock times are interpreted in. */
  timezone: string;
  title: string;
  /** Plain-text description; used as a fallback by clients that ignore HTML. */
  description: string;
  /**
   * Optional HTML description with the same content as `description` but
   * with embedded links. Apple Calendar, Outlook desktop, Google Calendar,
   * and Thunderbird all render this in preference to the plain text when
   * we emit it as the RFC 5545 `X-ALT-DESC;FMTTYPE=text/html` companion
   * property. Google's web URL `details=` parameter also accepts HTML.
   */
  descriptionHtml?: string;
  /** Event location. If it parses as `http(s)://…` we also expose it as `URL:`. */
  location: string;
  /**
   * RFC 5545 recurrence rule body, without the leading `"RRULE:"` property
   * name (e.g. `"FREQ=WEEKLY;BYDAY=TU,TH"`). Builders prepend the property
   * name in the formats their target requires.
   */
  recurrenceRule: string;
}

const stripDashes = (date: string) => date.replace(/-/g, '');
const hhmmss = (time: string) => {
  const { hours, minutes } = parseTime(time);
  return `${pad2(hours)}${pad2(minutes)}00`;
};

/**
 * Build a Google Calendar "TEMPLATE" URL for a recurring event. The `ctz`
 * parameter anchors the wall-clock times to the source timezone, so the
 * recurrence stays correct across DST transitions for users in any zone.
 *
 * `details` accepts HTML, so we send `descriptionHtml` when available to
 * preserve clickable links in the rendered event.
 */
export function buildGoogleCalendarUrl(event: CalendarEvent): string {
  const date = stripDashes(event.meetingDate);
  const start = `${date}T${hhmmss(event.startTime)}`;
  const end = `${date}T${hhmmss(event.endTime)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${end}`,
    ctz: event.timezone,
    details: event.descriptionHtml ?? event.description,
    location: event.location,
    recur: `RRULE:${event.recurrenceRule}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escape per RFC 5545 §3.3.11. */
function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * VTIMEZONE blocks for IANA zones we support. Hand-authored per RFC 5545
 * §3.6.5; kept minimal because we only care about the post-2007 US DST
 * rules currently in effect for `America/Los_Angeles`. Any new zone added
 * here needs a corresponding RRULE-based DAYLIGHT/STANDARD pair.
 *
 * The library upstream (`add-to-calendar-button`) instead pulls a full
 * historical zone database via `timezones-ical-library`; we don't need
 * historical accuracy because our meeting only recurs forward in time.
 */
const VTIMEZONE_BLOCKS: Readonly<Record<string, readonly string[]>> = {
  'America/Los_Angeles': [
    'BEGIN:VTIMEZONE',
    'TZID:America/Los_Angeles',
    'X-LIC-LOCATION:America/Los_Angeles',
    'BEGIN:DAYLIGHT',
    'DTSTART:20070311T020000',
    'TZOFFSETFROM:-0800',
    'TZOFFSETTO:-0700',
    'TZNAME:PDT',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'DTSTART:20071104T020000',
    'TZOFFSETFROM:-0700',
    'TZOFFSETTO:-0800',
    'TZNAME:PST',
    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ],
};

/**
 * Build an iCalendar (RFC 5545) document for a recurring meeting, anchored
 * to the source timezone via `TZID` and an inline `VTIMEZONE` block. The
 * resulting file imports correctly into Apple Calendar, Google Calendar
 * (via .ics import), and Thunderbird; recurring occurrences automatically
 * follow DST in the source zone.
 *
 * Clickable links: when `descriptionHtml` is provided we additionally emit
 * an `X-ALT-DESC;FMTTYPE=text/html` companion property (RFC 5545 §3.8.1.1
 * convention popularised by Microsoft and supported by Apple Calendar,
 * Outlook, Thunderbird, and Google Calendar). When `location` is an HTTP(S)
 * URL we expose it via the standard `URL` property too — Apple Calendar
 * surfaces it as a clickable button, and most other clients link it as
 * well.
 */
export function buildMeetingICS(
  event: CalendarEvent & { uid: string; dtstamp: Date },
): string {
  const tzBlock = VTIMEZONE_BLOCKS[event.timezone];
  if (!tzBlock) {
    throw new Error(`No VTIMEZONE block configured for ${event.timezone}`);
  }
  const date = stripDashes(event.meetingDate);
  const dtstart = `${date}T${hhmmss(event.startTime)}`;
  const dtend = `${date}T${hhmmss(event.endTime)}`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hylo//hylo-lang.github.io//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...tzBlock,
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${utcStamp(event.dtstamp)}`,
    `DTSTART;TZID=${event.timezone}:${dtstart}`,
    `DTEND;TZID=${event.timezone}:${dtend}`,
    `RRULE:${event.recurrenceRule}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    ...(event.descriptionHtml ? [
      `X-ALT-DESC;FMTTYPE=text/html:${escapeIcsText(
        `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 3.2//EN"><HTML><BODY>${event.descriptionHtml}</BODY></HTML>`,
      )}`,
    ] : []),
    `LOCATION:${escapeIcsText(event.location)}`,
    ...(/^https?:\/\//i.test(event.location) ? [`URL:${event.location}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  // RFC 5545 mandates CRLF line endings and a trailing CRLF.
  return lines.join('\r\n') + '\r\n';
}
