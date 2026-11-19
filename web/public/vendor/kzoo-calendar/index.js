// kzoo-calendar: a small, dependency-free .ics (iCalendar) reader. Works in browsers and Node, no DOM.
// Parses VEVENTs, expands RRULE (FREQ/INTERVAL/COUNT/UNTIL/BYDAY/BYMONTHDAY/BYMONTH/BYYEARDAY) and EXDATE,
// and answers "what is on this day". Originally written for the Kzoo Makers calendar page.
// shortcut: recurrence is expanded one year ahead only and ignores BYSETPOS/BYWEEKNO; upgrade to a full RFC 5545 engine if those turn up.

function parseICSDate(dateStr, isAllDay = false) {
  if (!dateStr) return null;

  // Remove TZID if present and get the actual date string
  const parts = dateStr.split(':');
  dateStr = parts[parts.length - 1];

  // Format: YYYYMMDDTHHMMSSZ or YYYYMMDD
  const year = parseInt(dateStr.substring(0, 4));
  const month = parseInt(dateStr.substring(4, 6)) - 1;
  const day = parseInt(dateStr.substring(6, 8));

  if (dateStr.length === 8 || isAllDay) {
    // All-day event - use local midnight
    return new Date(year, month, day, 0, 0, 0);
  }

  const hour = parseInt(dateStr.substring(9, 11));
  const minute = parseInt(dateStr.substring(11, 13));
  const second = parseInt(dateStr.substring(13, 15));

  if (dateStr.endsWith('Z')) {
    // UTC time - create UTC date and it will be displayed in local time
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }

  // Local time
  return new Date(year, month, day, hour, minute, second);
}

// Parse RRULE for recurring events
function parseRRule(rrule) {
  const rules = {};
  rrule.split(';').forEach(part => {
    const [key, value] = part.split('=');
    rules[key] = value;
  });
  return rules;
}

// Parse EXDATE (exception dates)
function parseEXDATE(exdateStr) {
  if (!exdateStr) return [];
  const dates = [];
  const parts = exdateStr.split(':');
  const dateStr = parts[parts.length - 1];

  dateStr.split(',').forEach(d => {
    const parsed = parseICSDate(d.trim());
    if (parsed) dates.push(parsed);
  });

  return dates;
}

// Check if a date matches any exception dates
function isExceptionDate(date, exceptionDates) {
  return exceptionDates.some(exDate =>
    date.getFullYear() === exDate.getFullYear() &&
    date.getMonth() === exDate.getMonth() &&
    date.getDate() === exDate.getDate()
  );
}

// Parse BYDAY rule (e.g., "MO,WE,FR" or "1MO" for first Monday)
function parseBYDAY(byday) {
  if (!byday) return null;
  const days = byday.split(',').map(d => {
    const match = d.match(/^([+-]?\d+)?([A-Z]{2})$/);
    if (!match) return null;
    return {
      nth: match[1] ? parseInt(match[1]) : null,
      day: match[2]
    };
  }).filter(d => d !== null);
  return days.length > 0 ? days : null;
}

// Get day of week number (0=Sunday, 1=Monday, etc.)
function getDayNum(dayStr) {
  const days = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  return days[dayStr];
}

// Check if date matches BYDAY rule
function matchesBYDAY(date, bydayRules) {
  if (!bydayRules) return true;

  const dayOfWeek = date.getDay();

  return bydayRules.some(rule => {
    if (getDayNum(rule.day) !== dayOfWeek) return false;

    // If no nth specified, any occurrence of this day matches
    if (rule.nth === null) return true;

    // Calculate which occurrence of this day in the month
    const dayOfMonth = date.getDate();
    const firstOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const firstDayOfWeek = firstOfMonth.getDay();

    // Calculate the nth occurrence
    let nthOccurrence;
    if (rule.nth > 0) {
      // Positive: 1st, 2nd, 3rd, etc.
      const daysUntilFirst = (getDayNum(rule.day) - firstDayOfWeek + 7) % 7;
      const firstOccurrenceDate = 1 + daysUntilFirst;
      nthOccurrence = Math.floor((dayOfMonth - firstOccurrenceDate) / 7) + 1;
      return nthOccurrence === rule.nth;
    } else {
      // Negative: -1 = last, -2 = second to last, etc.
      const lastOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const lastDayOfWeek = lastOfMonth.getDay();
      const daysFromLast = (lastDayOfWeek - getDayNum(rule.day) + 7) % 7;
      const lastOccurrenceDate = lastOfMonth.getDate() - daysFromLast;
      nthOccurrence = -Math.floor((lastOccurrenceDate - dayOfMonth) / 7) - 1;
      return nthOccurrence === rule.nth;
    }
  });
}

// Check if date matches BYMONTHDAY rule
function matchesBYMONTHDAY(date, bymonthday) {
  if (!bymonthday) return true;
  const days = bymonthday.split(',').map(d => parseInt(d));
  const dayOfMonth = date.getDate();
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

  return days.some(d => {
    if (d > 0) return d === dayOfMonth;
    // Negative values count from end of month
    return (lastDay + d + 1) === dayOfMonth;
  });
}

// Check if date matches BYMONTH rule
function matchesBYMONTH(date, bymonth) {
  if (!bymonth) return true;
  const months = bymonth.split(',').map(m => parseInt(m) - 1); // 0-indexed
  return months.includes(date.getMonth());
}

// Check if date matches BYYEARDAY rule
function matchesBYYEARDAY(date, byyearday) {
  if (!byyearday) return true;
  const days = byyearday.split(',').map(d => parseInt(d));
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date - startOfYear) / (24 * 60 * 60 * 1000)) + 1;
  const daysInYear = new Date(date.getFullYear(), 11, 31).getDate() === 31 ?
    (date.getFullYear() % 4 === 0 ? 366 : 365) : 365;

  return days.some(d => {
    if (d > 0) return d === dayOfYear;
    // Negative values count from end of year
    return (daysInYear + d + 1) === dayOfYear;
  });
}

// Generate recurring event instances
export function generateRecurringInstances(event, rrule, startDate, endDate, exceptionDates = [], from = new Date()) {
  const instances = [];
  const rules = parseRRule(rrule);

  const freq = rules.FREQ;
  const until = rules.UNTIL ? parseICSDate(rules.UNTIL) : new Date(from.getTime() + 365 * 24 * 60 * 60 * 1000);
  const count = rules.COUNT ? parseInt(rules.COUNT) : null;
  const interval = rules.INTERVAL ? parseInt(rules.INTERVAL) : 1;
  const byday = parseBYDAY(rules.BYDAY);
  const bymonthday = rules.BYMONTHDAY;
  const bymonth = rules.BYMONTH;
  const byyearday = rules.BYYEARDAY;

  let currentDate = new Date(startDate);
  let instanceCount = 0;

  // Use start of today for comparison
  const today = new Date(from);
  today.setHours(0, 0, 0, 0);

  // For WEEKLY with BYDAY, we need to generate instances for each specified day
  const maxIterations = 10000; // Safety limit
  let iterations = 0;

  while (currentDate <= until && currentDate <= new Date(from.getTime() + 365 * 24 * 60 * 60 * 1000) && iterations < maxIterations) {
    iterations++;

    // For COUNT-based rules, check if we've reached the limit
    if (count && instanceCount >= count) break;

    // Check if this date matches all the BY* rules
    const matchesRules = matchesBYDAY(currentDate, byday) &&
                        matchesBYMONTHDAY(currentDate, bymonthday) &&
                        matchesBYMONTH(currentDate, bymonth) &&
                        matchesBYYEARDAY(currentDate, byyearday);

    if (matchesRules && !isExceptionDate(currentDate, exceptionDates)) {
      if (currentDate >= today) {
        const duration = endDate - startDate;
        const instanceEnd = new Date(currentDate.getTime() + duration);

        instances.push({
          ...event,
          start: new Date(currentDate),
          end: instanceEnd
        });
      }

      // Always increment count when we find a matching instance (per RFC 2445)
      instanceCount++;
    }

    // Increment based on frequency and interval
    if (freq === 'DAILY') {
      currentDate.setDate(currentDate.getDate() + interval);
    } else if (freq === 'WEEKLY') {
      currentDate.setDate(currentDate.getDate() + (7 * interval));
    } else if (freq === 'MONTHLY') {
      currentDate.setMonth(currentDate.getMonth() + interval);
    } else if (freq === 'YEARLY') {
      currentDate.setFullYear(currentDate.getFullYear() + interval);
    } else {
      break;
    }
  }

  return instances;
}

// Parse ICS content
/** Events from .ics text, recurring ones expanded. Events that ended before the start of `from`'s day are dropped. */
export function parseICS(icsContent, from = new Date()) {
  const events = [];
  const replaced = new Set(); // "uid|start" of occurrences that an edited (RECURRENCE-ID) copy replaces or cancels
  const lines = icsContent.split(/\r?\n/);
  let currentEvent = null;
  let currentField = '';
  const now = new Date(from);
  now.setHours(0, 0, 0, 0); // Start of today

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Handle line continuation (lines starting with space or tab)
    if ((line.startsWith(' ') || line.startsWith('\t')) && currentField) {
      // Remove the leading space/tab and append to current field
      currentEvent[currentField] += line.substring(1);
      continue;
    }

    // Now trim the line for normal processing
    line = line.trim();

    if (line === 'BEGIN:VEVENT') {
      currentEvent = {};
    } else if (line === 'END:VEVENT' && currentEvent) {
      // Parse dates
      const dtstart = currentEvent.DTSTART || '';
      const dtend = currentEvent.DTEND || '';
      const isAllDay = !dtstart.includes('T');

      const startDate = parseICSDate(dtstart, isAllDay);
      const endDate = parseICSDate(dtend, isAllDay);
      const was = currentEvent['RECURRENCE-ID'] && parseICSDate(currentEvent['RECURRENCE-ID']);
      if (was) replaced.add(currentEvent.UID + '|' + +was); // the plain repeat of that day must go, even if the edited copy moved away or is in the past
      if (currentEvent.STATUS === 'CANCELLED') { currentEvent = null; currentField = ''; continue; }

      if (startDate) {
        // For non-recurring events, skip past events
        if (!currentEvent.RRULE && (endDate || startDate) < now) { // keeps a multi-day event that began earlier but is still on
          currentEvent = null;
          currentField = '';
          continue;
        }

        // For recurring events, check if they have future instances
        if (currentEvent.RRULE && !currentEvent['RECURRENCE-ID']) {
          // Parse RRULE to check UNTIL date
          const rules = parseRRule(currentEvent.RRULE);
          const until = rules.UNTIL ? parseICSDate(rules.UNTIL) : null;

          // Skip if recurring event has ended (UNTIL date is in the past)
          if (until && until < now) {
            currentEvent = null;
            currentField = '';
            continue;
          }
        }

        const event = {
          title: currentEvent.SUMMARY || 'Untitled Event',
          start: startDate,
          end: endDate || startDate,
          description: currentEvent.DESCRIPTION || '',
          location: currentEvent.LOCATION || '',
          isAllDay: isAllDay,
          uid: currentEvent.UID || ''
        };

        // Handle recurring events (but not RECURRENCE-ID exceptions which are single instances)
        if (currentEvent.RRULE && !currentEvent['RECURRENCE-ID']) {
          // Parse exception dates if present
          const exceptionDates = currentEvent.EXDATE ? parseEXDATE(currentEvent.EXDATE) : [];
          const instances = generateRecurringInstances(event, currentEvent.RRULE, startDate, endDate || startDate, exceptionDates, from);
          events.push(...instances.map((i) => ({ ...i, repeat: true })));
        } else {
          // Single event or recurrence exception
          events.push(event);
        }
      }

      currentEvent = null;
      currentField = '';
    } else if (currentEvent && line.includes(':')) {
      const colonIndex = line.indexOf(':');
      const field = line.substring(0, colonIndex).split(';')[0];
      const value = line.substring(colonIndex + 1);

      currentEvent[field] = value;
      currentField = field;
    }
  }

  return events.filter((e) => !(e.repeat && replaced.has(e.uid + '|' + +e.start))).map(({ repeat, ...e }) => e);
}

/** Events happening on the calendar day of `day` (local time), earliest first. Also catches multi-day events that span it. */
export function eventsOn(events, day = new Date()) {
  const from = new Date(day.getFullYear(), day.getMonth(), day.getDate()), to = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return events
    .filter((e) => e.start < to && (e.end > from || +e.start === +e.end && e.start >= from)) // all-day ends are exclusive, so an event that ended at midnight is not "today"
    .sort((a, b) => a.start - b.start);
}

/** Same as the page's time label, e.g. "7:00 PM". */
export const timeLabel = (d) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** Unescapes ICS text values (\\, \n, \, \;). */
export function cleanICSText(text) {
  if (!text) return '';

  // Unescape backslash-escaped characters (like \, and \n and \\)
  // Order matters: do \\ first, then others
  text = text.replace(/\\\\/g, '\x00'); // Temporarily replace \\ with null char
  text = text.replace(/\\n/g, '\n');
  text = text.replace(/\\,/g, ',');
  text = text.replace(/\\;/g, ';');
  text = text.replace(/\x00/g, '\\'); // Restore single backslashes

  return text.trim();
}
