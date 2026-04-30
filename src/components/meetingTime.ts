import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';

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

const TUESDAY = 2;
const THURSDAY = 4;

/** Day-of-week predicate matching JS `Date.getDay()` convention (Sunday = 0). */
export function isMeetingDay(dayOfWeek: number): boolean {
  return dayOfWeek === TUESDAY || dayOfWeek === THURSDAY;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Compute the next Tuesday/Thursday meeting date as a "yyyy-MM-dd" string in
 * the given source timezone.
 *
 * The computation is performed entirely in the source timezone using explicit
 * IANA conversions, so the result does NOT depend on the runtime's local
 * timezone (important when building on a server in UTC while the meeting is
 * defined in e.g. Europe/Amsterdam).
 *
 * If "today" in the source timezone is a meeting day and the meeting's start
 * time has not yet been reached, today is returned. Otherwise the next
 * Tuesday/Thursday (in source-TZ calendar days) is returned.
 */
export function getNextMeetingDate(
  now: Date,
  startTime: string,
  timezone: string,
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

    if (!isMeetingDay(dow)) continue;

    // If the candidate is today, skip it when the meeting has already started.
    if (candidate === todayStr) {
      const meetingStartUTC = fromZonedTime(`${candidate}T${startHHMM}`, timezone);
      if (now.getTime() >= meetingStartUTC.getTime()) continue;
    }

    return candidate;
  }

  // Defensive fallback (should be unreachable: two meeting days always exist
  // within any 7-day window).
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

export interface RenderMeetingArgs {
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
export function renderMeetingDescription(args: RenderMeetingArgs): MeetingDescription {
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
