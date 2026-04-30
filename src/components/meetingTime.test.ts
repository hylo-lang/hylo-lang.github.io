import { describe, it, expect } from 'vitest';
import { formatInTimeZone } from 'date-fns-tz';
import {
  buildGoogleCalendarUrl,
  buildMeetingICS,
  getNextMeetingDate,
  parseTime,
  isMeetingDay,
  meetingInstant,
  renderMeetingDescription,
  type CalendarEvent,
} from './meetingTime.ts';

const AMS = 'Europe/Amsterdam';
const LA = 'America/Los_Angeles';

const TUESDAY = 2;
const THURSDAY = 4;
const TU_TH = [TUESDAY, THURSDAY];
const RRULE_TU_TH = 'FREQ=WEEKLY;BYDAY=TU,TH';

const SAMPLE_EVENT: CalendarEvent = {
  meetingDate: '2026-05-05',
  startTime: '12:00',
  endTime: '13:00',
  timezone: LA,
  title: "Hylo Developers' Meeting",
  description: 'Weekly developer sync',
  location: 'https://example.com/meeting',
  recurrenceRule: RRULE_TU_TH,
};

// Reference calendar context used throughout the tests:
//   2026-05-04  Mon        (CEST, UTC+2)
//   2026-05-05  Tue        (CEST, UTC+2)
//   2026-05-06  Wed        (CEST, UTC+2)
//   2026-05-07  Thu        (CEST, UTC+2)
//   2026-05-08  Fri        (CEST, UTC+2)
//   2026-05-10  Sun        (CEST, UTC+2)
//   2026-05-12  Tue        (CEST, UTC+2)
//   2026-03-26  Thu        (CET,  UTC+1)   — DST starts Sun 2026-03-29
//   2026-03-31  Tue        (CEST, UTC+2)
//   2026-10-22  Thu        (CEST, UTC+2)   — DST ends Sun 2026-10-25
//   2026-10-27  Tue        (CET,  UTC+1)

describe('parseTime', () => {
  it('parses valid 24-hour times', () => {
    expect(parseTime('00:00')).toEqual({ hours: 0, minutes: 0 });
    expect(parseTime('9:05')).toEqual({ hours: 9, minutes: 5 });
    expect(parseTime('21:00')).toEqual({ hours: 21, minutes: 0 });
    expect(parseTime('23:59')).toEqual({ hours: 23, minutes: 59 });
  });

  it('rejects malformed input', () => {
    expect(() => parseTime('9pm')).toThrow();
    expect(() => parseTime('9:5')).toThrow();
    expect(() => parseTime('24:00')).toThrow();
    expect(() => parseTime('12:60')).toThrow();
    expect(() => parseTime('')).toThrow();
  });
});

describe('isMeetingDay', () => {
  it('returns true exactly when the weekday is in the meetingDays set', () => {
    expect(isMeetingDay(0, TU_TH)).toBe(false); // Sun
    expect(isMeetingDay(1, TU_TH)).toBe(false); // Mon
    expect(isMeetingDay(2, TU_TH)).toBe(true);  // Tue
    expect(isMeetingDay(3, TU_TH)).toBe(false); // Wed
    expect(isMeetingDay(4, TU_TH)).toBe(true);  // Thu
    expect(isMeetingDay(5, TU_TH)).toBe(false); // Fri
    expect(isMeetingDay(6, TU_TH)).toBe(false); // Sat
  });

  it('honours arbitrary meetingDays sets', () => {
    expect(isMeetingDay(1, [1, 3, 5])).toBe(true);  // Mon in MWF
    expect(isMeetingDay(2, [1, 3, 5])).toBe(false); // Tue not in MWF
    expect(isMeetingDay(0, [])).toBe(false);        // empty set
  });
});

describe('getNextMeetingDate — Europe/Amsterdam 21:00', () => {
  const start = '21:00';

  it('Monday -> upcoming Tuesday', () => {
    const now = new Date('2026-05-04T10:00:00Z'); // Mon 12:00 Amsterdam
    expect(getNextMeetingDate(now, start, AMS, TU_TH)).toBe('2026-05-05');
  });

  it('Tuesday before 21:00 -> today', () => {
    const now = new Date('2026-05-05T18:00:00Z'); // Tue 20:00 Amsterdam
    expect(getNextMeetingDate(now, start, AMS, TU_TH)).toBe('2026-05-05');
  });

  it('Tuesday exactly at 21:00 -> Thursday (not today)', () => {
    const now = new Date('2026-05-05T19:00:00Z'); // Tue 21:00 Amsterdam sharp
    expect(getNextMeetingDate(now, start, AMS, TU_TH)).toBe('2026-05-07');
  });

  it('Tuesday after meeting -> Thursday', () => {
    const now = new Date('2026-05-05T19:30:00Z'); // Tue 21:30 Amsterdam
    expect(getNextMeetingDate(now, start, AMS, TU_TH)).toBe('2026-05-07');
  });

  it('Wednesday -> Thursday', () => {
    const now = new Date('2026-05-06T10:00:00Z');
    expect(getNextMeetingDate(now, start, AMS, TU_TH)).toBe('2026-05-07');
  });

  it('Thursday before 21:00 -> today', () => {
    const now = new Date('2026-05-07T18:00:00Z'); // Thu 20:00 Amsterdam
    expect(getNextMeetingDate(now, start, AMS, TU_TH)).toBe('2026-05-07');
  });

  it('Thursday after meeting -> next Tuesday', () => {
    const now = new Date('2026-05-07T19:30:00Z'); // Thu 21:30 Amsterdam
    expect(getNextMeetingDate(now, start, AMS, TU_TH)).toBe('2026-05-12');
  });

  it('Friday -> next Tuesday', () => {
    const now = new Date('2026-05-08T10:00:00Z');
    expect(getNextMeetingDate(now, start, AMS, TU_TH)).toBe('2026-05-12');
  });

  it('Sunday -> next Tuesday', () => {
    const now = new Date('2026-05-10T10:00:00Z');
    expect(getNextMeetingDate(now, start, AMS, TU_TH)).toBe('2026-05-12');
  });

  it('UTC day still Monday but source-TZ day already Tuesday -> that Tuesday', () => {
    // 22:30Z on Mon = 00:30 Tue in Amsterdam (CEST). Meeting at 21:00 Tue is ahead.
    const now = new Date('2026-05-04T22:30:00Z');
    expect(getNextMeetingDate(now, start, AMS, TU_TH)).toBe('2026-05-05');
  });

  it('UTC day already Wednesday but source-TZ still Tuesday 23:30 after meeting -> Thursday', () => {
    // 21:30Z on Tue = 23:30 Tue Amsterdam (CEST). Meeting passed. Next = Thu.
    const now = new Date('2026-05-05T21:30:00Z');
    expect(getNextMeetingDate(now, start, AMS, TU_TH)).toBe('2026-05-07');
  });

  it('handles spring-forward DST between today and next meeting', () => {
    // Thu 2026-03-26 21:30 CET = 20:30Z; next meeting crosses DST start (Sun 03-29).
    const now = new Date('2026-03-26T20:30:00Z');
    expect(getNextMeetingDate(now, start, AMS, TU_TH)).toBe('2026-03-31');
  });

  it('handles fall-back DST between today and next meeting', () => {
    // Thu 2026-10-22 22:30 CEST = 20:30Z; next meeting crosses DST end (Sun 10-25).
    const now = new Date('2026-10-22T20:30:00Z');
    expect(getNextMeetingDate(now, start, AMS, TU_TH)).toBe('2026-10-27');
  });
});

describe('getNextMeetingDate — America/Los_Angeles 12:00', () => {
  const start = '12:00';

  it('Tue before noon LA -> today in LA', () => {
    // 18:00Z Tue = 11:00 PT Tue (PDT, UTC-7) in May.
    const now = new Date('2026-05-05T18:00:00Z');
    expect(getNextMeetingDate(now, start, LA, TU_TH)).toBe('2026-05-05');
  });

  it('Tue after noon LA -> Thursday', () => {
    // 20:00Z Tue = 13:00 PT Tue (PDT).
    const now = new Date('2026-05-05T20:00:00Z');
    expect(getNextMeetingDate(now, start, LA, TU_TH)).toBe('2026-05-07');
  });

  it('UTC already Thursday but source-TZ still Wednesday evening -> Thursday', () => {
    // 04:00Z Thu = 21:00 PT Wed. Next meeting = Thu (local).
    const now = new Date('2026-05-07T04:00:00Z');
    expect(getNextMeetingDate(now, start, LA, TU_TH)).toBe('2026-05-07');
  });

  it('honours an alternative meeting-days set', () => {
    // Mon-Wed-Fri schedule. 18:00Z Tue (any week) -> next Wed.
    const now = new Date('2026-05-05T18:00:00Z');
    expect(getNextMeetingDate(now, start, LA, [1, 3, 5])).toBe('2026-05-06');
  });
});

describe('meetingInstant', () => {
  it('converts source-TZ wall-clock to correct UTC (CEST, UTC+2)', () => {
    // 21:00 Amsterdam on 2026-05-05 (CEST) = 19:00Z.
    expect(meetingInstant('2026-05-05', '21:00', AMS).toISOString())
      .toBe('2026-05-05T19:00:00.000Z');
  });

  it('converts source-TZ wall-clock to correct UTC (CET, UTC+1)', () => {
    // 21:00 Amsterdam on 2026-11-03 (CET, after DST end) = 20:00Z.
    expect(meetingInstant('2026-11-03', '21:00', AMS).toISOString())
      .toBe('2026-11-03T20:00:00.000Z');
  });

  it('converts source-TZ wall-clock to correct UTC for America/Los_Angeles', () => {
    // 12:00 PT on 2026-05-05 (PDT, UTC-7) = 19:00Z.
    expect(meetingInstant('2026-05-05', '12:00', LA).toISOString())
      .toBe('2026-05-05T19:00:00.000Z');
  });
});

// US and EU observe DST on different dates:
//   US DST:  2nd Sun of March  – 1st Sun of November  (in 2026: Mar 8  – Nov 1)
//   EU DST:  last Sun of March – last Sun of October  (in 2026: Mar 29 – Oct 25)
// This creates two annual windows where LA↔Amsterdam differ by 8h instead of 9h.
describe('US/EU DST mismatch — meetings defined in America/Los_Angeles', () => {
  // In each case, 12:00 Los Angeles is the canonical meeting wall-clock; the
  // test asserts both the absolute UTC instant and the corresponding
  // Amsterdam wall-clock, to make the behaviour obvious at a glance.

  it('winter: 12:00 PST (UTC-8) = 21:00 Amsterdam CET (9h diff)', () => {
    // 2026-02-10 is Tue, both zones on standard time.
    const instant = meetingInstant('2026-02-10', '12:00', LA);
    expect(instant.toISOString()).toBe('2026-02-10T20:00:00.000Z');
    expect(formatInTimeZone(instant, AMS, 'HH:mm')).toBe('21:00');
  });

  it('spring gap: 12:00 PDT (UTC-7) = 20:00 Amsterdam CET (8h diff, 1h earlier than usual)', () => {
    // 2026-03-17 is Tue; US on DST since Mar 8, EU not until Mar 29.
    const instant = meetingInstant('2026-03-17', '12:00', LA);
    expect(instant.toISOString()).toBe('2026-03-17T19:00:00.000Z');
    expect(formatInTimeZone(instant, AMS, 'HH:mm')).toBe('20:00');
  });

  it('summer: 12:00 PDT (UTC-7) = 21:00 Amsterdam CEST (9h diff)', () => {
    // 2026-05-05 is Tue, both zones on DST.
    const instant = meetingInstant('2026-05-05', '12:00', LA);
    expect(instant.toISOString()).toBe('2026-05-05T19:00:00.000Z');
    expect(formatInTimeZone(instant, AMS, 'HH:mm')).toBe('21:00');
  });

  it('fall gap: 12:00 PDT (UTC-7) = 20:00 Amsterdam CET (8h diff, 1h earlier than usual)', () => {
    // 2026-10-27 is Tue; EU off DST since Oct 25, US still on until Nov 1.
    const instant = meetingInstant('2026-10-27', '12:00', LA);
    expect(instant.toISOString()).toBe('2026-10-27T19:00:00.000Z');
    expect(formatInTimeZone(instant, AMS, 'HH:mm')).toBe('20:00');
  });

  it('late fall: 12:00 PST (UTC-8) = 21:00 Amsterdam CET (9h diff, back to normal)', () => {
    // 2026-11-03 is Tue; both zones on standard time.
    const instant = meetingInstant('2026-11-03', '12:00', LA);
    expect(instant.toISOString()).toBe('2026-11-03T20:00:00.000Z');
    expect(formatInTimeZone(instant, AMS, 'HH:mm')).toBe('21:00');
  });

  it('getNextMeetingDate works during the spring gap', () => {
    // Tue 2026-03-17 17:00Z = 10:00 PDT. Meeting at 12:00 PDT still ahead.
    const now = new Date('2026-03-17T17:00:00Z');
    expect(getNextMeetingDate(now, '12:00', LA, TU_TH)).toBe('2026-03-17');
  });

  it('getNextMeetingDate works during the fall gap', () => {
    // Thu 2026-10-29 21:00Z = 14:00 PDT. Meeting at 12:00 PDT already passed.
    const now = new Date('2026-10-29T21:00:00Z');
    expect(getNextMeetingDate(now, '12:00', LA, TU_TH)).toBe('2026-11-03');
  });
});

describe('renderMeetingDescription', () => {
  const TOKYO = 'Asia/Tokyo';
  const title = 'Developer Meetings on Tuesdays and Thursdays';

  // --- Same-timezone rendering: no tz label, no day note ---

  it('same TZ, meeting today -> "Today"', () => {
    // now = Tue 2026-05-05 12:00 Amsterdam (10:00Z), meeting 21:00 Amsterdam.
    const result = renderMeetingDescription({
      now: new Date('2026-05-05T10:00:00Z'),
      meetingDate: '2026-05-05',
      startTime: '21:00',
      endTime: '22:00',
      sourceTimezone: AMS,
      userTimeZone: AMS,
      title,
    });
    expect(result).toEqual({
      title,
      details: 'Next meeting: Today, 9:00 PM–10:00 PM',
    });
  });

  it('same TZ, meeting tomorrow -> "Tomorrow"', () => {
    // now = Wed 2026-05-06 12:00 Amsterdam (10:00Z), meeting on Thu 2026-05-07.
    const result = renderMeetingDescription({
      now: new Date('2026-05-06T10:00:00Z'),
      meetingDate: '2026-05-07',
      startTime: '21:00',
      endTime: '22:00',
      sourceTimezone: AMS,
      userTimeZone: AMS,
      title,
    });
    expect(result.details).toBe('Next meeting: Tomorrow, 9:00 PM–10:00 PM');
  });

  it('same TZ, meeting several days away -> absolute "MMMM d"', () => {
    // now = Fri 2026-05-08 12:00 Amsterdam, meeting on Tue 2026-05-12.
    const result = renderMeetingDescription({
      now: new Date('2026-05-08T10:00:00Z'),
      meetingDate: '2026-05-12',
      startTime: '21:00',
      endTime: '22:00',
      sourceTimezone: AMS,
      userTimeZone: AMS,
      title,
    });
    expect(result.details).toBe('Next meeting: May 12, 9:00 PM–10:00 PM');
  });

  // --- Cross-timezone rendering: tz label, optional day note ---

  it('cross-TZ, same calendar day -> tz label, no day note', () => {
    // Meeting 12:00 LA on Tue 2026-05-05 (PDT) = 21:00 Amsterdam CEST same day.
    // now = Mon 2026-05-04 12:00 Amsterdam, so in Amsterdam the meeting is "Tomorrow".
    const result = renderMeetingDescription({
      now: new Date('2026-05-04T10:00:00Z'),
      meetingDate: '2026-05-05',
      startTime: '12:00',
      endTime: '13:00',
      sourceTimezone: LA,
      userTimeZone: AMS,
      title,
    });
    expect(result.details).toBe('Next meeting: Tomorrow, 9:00 PM–10:00 PM Amsterdam');
  });

  it('cross-TZ, user east of source -> "(next day)" note', () => {
    // Meeting 21:00 Amsterdam Tue 2026-05-05 CEST = 04:00 Wed Tokyo.
    // now = Tue 2026-05-05 19:00 Tokyo -> meeting day in Tokyo is "Tomorrow".
    const result = renderMeetingDescription({
      now: new Date('2026-05-05T10:00:00Z'),
      meetingDate: '2026-05-05',
      startTime: '21:00',
      endTime: '22:00',
      sourceTimezone: AMS,
      userTimeZone: TOKYO,
      title,
    });
    expect(result.details).toBe('Next meeting: Tomorrow, 4:00 AM–5:00 AM Tokyo (next day)');
  });

  it('cross-TZ, user west of source -> "(previous day)" note', () => {
    // Meeting 02:00 Tokyo Wed 2026-05-06 (JST, UTC+9) = 10:00 Tue LA (PDT, UTC-7).
    // Source calendar day = 2026-05-06, user calendar day = 2026-05-05.
    // now = Tue 2026-05-05 00:00 LA, so the meeting is "Today" in the user's TZ.
    const result = renderMeetingDescription({
      now: new Date('2026-05-05T07:00:00Z'),
      meetingDate: '2026-05-06',
      startTime: '02:00',
      endTime: '03:00',
      sourceTimezone: TOKYO,
      userTimeZone: LA,
      title,
    });
    expect(result.details).toBe(
      'Next meeting: Today, 10:00 AM–11:00 AM Los_Angeles (previous day)',
    );
  });

  // --- "Today"/"Tomorrow" must be relative to the user's TZ, not the source ---

  it('label uses user TZ: meeting today-in-source, tomorrow-in-user -> "Tomorrow"', () => {
    // Source: Tue 2026-05-05 21:00 Amsterdam -> 04:00 Wed Tokyo.
    // Tokyo user at Tue 23:00 local (14:00Z) sees meeting as "Tomorrow".
    const result = renderMeetingDescription({
      now: new Date('2026-05-05T14:00:00Z'),
      meetingDate: '2026-05-05',
      startTime: '21:00',
      endTime: '22:00',
      sourceTimezone: AMS,
      userTimeZone: TOKYO,
      title,
    });
    expect(result.details.startsWith('Next meeting: Tomorrow,')).toBe(true);
  });

  it('label uses user TZ: meeting tomorrow-in-source, today-in-user -> "Today"', () => {
    // Source: Wed 2026-05-06 02:00 Tokyo -> 10:00 Tue LA.
    // LA user at Tue 00:00 local (07:00Z) sees meeting as "Today".
    const result = renderMeetingDescription({
      now: new Date('2026-05-05T07:00:00Z'),
      meetingDate: '2026-05-06',
      startTime: '02:00',
      endTime: '03:00',
      sourceTimezone: TOKYO,
      userTimeZone: LA,
      title,
    });
    expect(result.details.startsWith('Next meeting: Today,')).toBe(true);
  });

  // Regression for the "Next meeting: January 26, 12:00 PM–1:00 PM shown on
  // Feb 17" bug: exercises the full caller flow (compute meetingDate from
  // `now`, then render) to verify it produces a fresh, non-past date when the
  // page is viewed long after whatever prior date had been computed.
  it('full flow on Feb 17 does not render a past January date', () => {
    // now = Tue 2026-02-17 00:00 LA (08:00Z, PST, pre-DST).
    const now = new Date('2026-02-17T08:00:00Z');
    const startTime = '12:00';
    const endTime = '13:00';

    const meetingDate = getNextMeetingDate(now, startTime, LA, TU_TH);
    // Meeting at 12:00 PST on Tue 02-17 is still ahead of now (00:00 local).
    expect(meetingDate).toBe('2026-02-17');

    const result = renderMeetingDescription({
      now,
      meetingDate,
      startTime,
      endTime,
      sourceTimezone: LA,
      userTimeZone: LA,
      title,
    });
    expect(result.details).toBe('Next meeting: Today, 12:00 PM–1:00 PM');
  });

  it('returns the title unchanged', () => {
    const result = renderMeetingDescription({
      now: new Date('2026-05-05T10:00:00Z'),
      meetingDate: '2026-05-05',
      startTime: '21:00',
      endTime: '22:00',
      sourceTimezone: AMS,
      userTimeZone: AMS,
      title: 'Custom title',
    });
    expect(result.title).toBe('Custom title');
  });
});

describe('buildGoogleCalendarUrl', () => {
  it('produces a TEMPLATE URL with the event wall-clock times and source TZ', () => {
    const url = buildGoogleCalendarUrl(SAMPLE_EVENT);
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(parsed.searchParams.get('action')).toBe('TEMPLATE');
    expect(parsed.searchParams.get('text')).toBe(SAMPLE_EVENT.title);
    expect(parsed.searchParams.get('dates')).toBe('20260505T120000/20260505T130000');
    expect(parsed.searchParams.get('ctz')).toBe(LA);
    expect(parsed.searchParams.get('details')).toBe(SAMPLE_EVENT.description);
    expect(parsed.searchParams.get('location')).toBe(SAMPLE_EVENT.location);
    expect(parsed.searchParams.get('recur')).toBe(`RRULE:${RRULE_TU_TH}`);
  });

  it('prefers descriptionHtml over description for the details param', () => {
    // Google Calendar's `details` param accepts HTML, so we pass the HTML
    // version verbatim — that is what makes embedded links clickable in
    // the rendered event.
    const url = buildGoogleCalendarUrl({
      ...SAMPLE_EVENT,
      descriptionHtml: 'Join via <a href="https://example.com/meeting">our call</a>',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('details')).toBe(
      'Join via <a href="https://example.com/meeting">our call</a>',
    );
  });
});

describe('buildMeetingICS', () => {
  const dtstamp = new Date('2026-05-04T10:30:00Z');
  const baseArgs = { ...SAMPLE_EVENT, uid: 'unit-test@hylo-lang.org', dtstamp };

  it('emits a recurring VEVENT with the LA TZID and an inline VTIMEZONE block', () => {
    const ics = buildMeetingICS(baseArgs);

    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('\r\n')).toBe(true);
    // Must use CRLF per RFC 5545 §3.1.
    expect(ics.split('\n').every((line) => line === '' || line.endsWith('\r'))).toBe(true);

    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('BEGIN:VTIMEZONE\r\nTZID:America/Los_Angeles');
    expect(ics).toContain('BEGIN:DAYLIGHT');
    expect(ics).toContain('TZNAME:PDT');
    expect(ics).toContain('TZNAME:PST');
    expect(ics).toContain('UID:unit-test@hylo-lang.org');
    expect(ics).toContain('DTSTAMP:20260504T103000Z');
    expect(ics).toContain('DTSTART;TZID=America/Los_Angeles:20260505T120000');
    expect(ics).toContain('DTEND;TZID=America/Los_Angeles:20260505T130000');
    expect(ics).toContain(`RRULE:${RRULE_TU_TH}`);
    expect(ics).toContain(`SUMMARY:${SAMPLE_EVENT.title}`);
    expect(ics).toContain(`LOCATION:${SAMPLE_EVENT.location}`);
  });

  it('escapes RFC 5545 special characters in text fields', () => {
    const ics = buildMeetingICS({
      ...baseArgs,
      title: 'Title; with, special\\chars',
      description: 'Line 1\nLine 2',
    });
    expect(ics).toContain('SUMMARY:Title\\; with\\, special\\\\chars');
    expect(ics).toContain('DESCRIPTION:Line 1\\nLine 2');
  });

  it('throws on unsupported timezones rather than silently emitting a broken file', () => {
    expect(() =>
      buildMeetingICS({ ...baseArgs, timezone: 'Europe/Amsterdam' }),
    ).toThrow(/No VTIMEZONE block configured/);
  });

  it('emits URL: alongside LOCATION: when the location is an http(s) URL', () => {
    // Apple Calendar surfaces URL: as a clickable button distinct from the
    // location field. Most other clients also linkify it.
    const ics = buildMeetingICS(baseArgs);
    expect(ics).toContain(`URL:${SAMPLE_EVENT.location}`);
  });

  it('omits URL: when the location is not an http(s) URL', () => {
    const ics = buildMeetingICS({ ...baseArgs, location: 'Conference Room B' });
    expect(ics).toContain('LOCATION:Conference Room B');
    expect(ics).not.toMatch(/^URL:/m);
  });

  it('omits X-ALT-DESC when descriptionHtml is not provided', () => {
    const ics = buildMeetingICS(baseArgs);
    expect(ics).not.toContain('X-ALT-DESC');
  });

  it('emits an X-ALT-DESC HTML companion property when descriptionHtml is provided', () => {
    // The HTML alternative description is what makes embedded links
    // clickable in Apple Calendar, Outlook desktop, and Thunderbird; it
    // sits next to the plain DESCRIPTION which clients fall back to.
    const ics = buildMeetingICS({
      ...baseArgs,
      descriptionHtml: 'Join via <a href="https://example.com/meeting">our call</a>',
    });
    expect(ics).toContain('DESCRIPTION:' + SAMPLE_EVENT.description);
    expect(ics).toMatch(/X-ALT-DESC;FMTTYPE=text\/html:/);
    expect(ics).toContain('<HTML><BODY>');
    expect(ics).toContain('Join via <a href="https://example.com/meeting">our call</a>');
    expect(ics).toContain('</BODY></HTML>');
  });

  it('escapes RFC 5545 special characters inside the X-ALT-DESC HTML payload', () => {
    // X-ALT-DESC is a TEXT-typed property; semicolons / commas / backslashes
    // must still be escaped per §3.3.11. Receiving clients un-escape before
    // parsing the payload as HTML.
    const ics = buildMeetingICS({
      ...baseArgs,
      descriptionHtml: 'a; b, c\\d',
    });
    expect(ics).toMatch(/X-ALT-DESC;FMTTYPE=text\/html:[^\r\n]*a\\; b\\, c\\\\d/);
  });
});
