/**
 * RFC 5545 Section 3.3 - Value Type Parsers
 *
 * Each parser takes a raw string value (already unescaped of line folding)
 * and returns a structured representation, or throws on invalid input.
 */

// ---------------------------------------------------------------------------
// DATE  (Section 3.3.4)
// Format: YYYYMMDD
// Returns: { year, month (1-12), day }
// ---------------------------------------------------------------------------
export function parseDate(str) {
  const s = str.trim();
  if (!/^\d{8}$/.test(s)) throw new Error(`Invalid DATE: ${str}`);
  return {
    year:  parseInt(s.slice(0, 4), 10),
    month: parseInt(s.slice(4, 6), 10),
    day:   parseInt(s.slice(6, 8), 10),
  };
}

export function dateToJSDate(d) {
  return new Date(d.year, d.month - 1, d.day, 0, 0, 0, 0);
}

// ---------------------------------------------------------------------------
// DATE-TIME  (Section 3.3.5)
// Forms:
//   YYYYMMDDTHHMMSS         - "floating" local time (no timezone)
//   YYYYMMDDTHHMMSSZ        - UTC
//   YYYYMMDDTHHMMSS + TZID  - timezone-qualified (TZID passed separately)
//
// Returns: { year, month, day, hour, minute, second, utc, floating, tzid }
//   utc      = true  -> Z suffix was present; JS Date in UTC
//   floating = true  -> no Z, no TZID; interpret as local time
//   tzid     = string (from the TZID param, if present)
// ---------------------------------------------------------------------------
export function parseDateTime(str, tzid = null) {
  const s = str.trim();
  const utc = s.endsWith('Z');
  const base = utc ? s.slice(0, -1) : s;

  if (!/^\d{8}T\d{6}$/.test(base))
    throw new Error(`Invalid DATE-TIME: ${str}`);

  return {
    year:     parseInt(base.slice(0, 4), 10),
    month:    parseInt(base.slice(4, 6), 10),
    day:      parseInt(base.slice(6, 8), 10),
    hour:     parseInt(base.slice(9, 11), 10),
    minute:   parseInt(base.slice(11, 13), 10),
    second:   parseInt(base.slice(13, 15), 10),
    utc,
    floating: !utc && !tzid,
    tzid:     tzid || null,
  };
}

/**
 * Convert a parsed DATE-TIME to a JS Date.
 * If a tzRegistry is supplied (from timezone.js) and the value has a TZID,
 * the offset is resolved and the date is converted to UTC.
 * Floating times are treated as local.
 */
export function dateTimeToJSDate(dt, tzRegistry = null) {
  if (dt.utc) {
    return new Date(Date.UTC(dt.year, dt.month - 1, dt.day,
                             dt.hour, dt.minute, dt.second));
  }
  if (dt.tzid && tzRegistry) {
    return tzRegistry.toUTC(dt, dt.tzid);
  }
  // Floating or unresolvable TZID — treat as local
  return new Date(dt.year, dt.month - 1, dt.day,
                  dt.hour, dt.minute, dt.second);
}

/**
 * Parse the raw value of a DTSTART/DTEND/etc. property, handling both
 * DATE and DATE-TIME. Accepts a params object that may have values as
 * strings OR as string arrays (as produced by parser.js).
 *
 * Returns: { isDate, isDateTime, date?, dateTime?, jsDate (best-effort) }
 */
export function parseDateOrDateTime(rawValue, params = {}) {
  // Normalise param values: accept both 'string' and ['string'] forms
  const paramVal = (key) => {
    const v = params[key];
    if (!v) return null;
    return Array.isArray(v) ? v[0] : v;
  };

  const isDate = (paramVal('VALUE') === 'DATE') ||
                 (!/T/.test(rawValue) && /^\d{8}$/.test(rawValue.trim()));

  if (isDate) {
    const date = parseDate(rawValue);
    return { isDate: true, isDateTime: false, date, jsDate: dateToJSDate(date) };
  }

  const tzid  = paramVal('TZID');
  const dt    = parseDateTime(rawValue, tzid);
  return { isDate: false, isDateTime: true, dateTime: dt, jsDate: dateTimeToJSDate(dt) };
}

// ---------------------------------------------------------------------------
// DURATION  (Section 3.3.6)
// Format: (+|-)P(nW | nDTnHnMnS)
// Returns: milliseconds (signed)
// ---------------------------------------------------------------------------
export function parseDuration(str) {
  const s = str.trim();
  const sign = s.startsWith('-') ? -1 : 1;
  const body = s.replace(/^[+-]/, '');

  // Week form: PnW
  const weekMatch = body.match(/^P(\d+)W$/);
  if (weekMatch) {
    return sign * parseInt(weekMatch[1], 10) * 7 * 86400 * 1000;
  }

  // Full form: PnDTnHnMnS (all parts optional but at least one required)
  const fullMatch = body.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/
  );
  if (!fullMatch || body === 'P' || body === 'PT')
    throw new Error(`Invalid DURATION: ${str}`);

  const d = parseInt(fullMatch[1] || '0', 10);
  const h = parseInt(fullMatch[2] || '0', 10);
  const m = parseInt(fullMatch[3] || '0', 10);
  const sc = parseInt(fullMatch[4] || '0', 10);

  return sign * ((d * 86400 + h * 3600 + m * 60 + sc) * 1000);
}

/** Format milliseconds back to an RFC 5545 DURATION string */
export function formatDuration(ms) {
  const sign = ms < 0 ? '-' : '';
  let secs = Math.abs(ms) / 1000;
  const d = Math.floor(secs / 86400); secs -= d * 86400;
  const h = Math.floor(secs / 3600);  secs -= h * 3600;
  const m = Math.floor(secs / 60);    secs -= m * 60;
  const s = secs;

  if (!h && !m && !s) return `${sign}P${d}D`;
  const timePart = `${h ? h + 'H' : ''}${m ? m + 'M' : ''}${s ? s + 'S' : ''}`;
  return `${sign}P${d ? d + 'D' : ''}T${timePart}`;
}

// ---------------------------------------------------------------------------
// PERIOD  (Section 3.3.9)
// Format: DATE-TIME "/" DATE-TIME  or  DATE-TIME "/" DURATION
// Returns: { start: DateTime, end?: DateTime, duration?: number (ms) }
// ---------------------------------------------------------------------------
export function parsePeriod(str, params = {}) {
  const slash = str.indexOf('/');
  if (slash === -1) throw new Error(`Invalid PERIOD: ${str}`);

  const startStr = str.slice(0, slash);
  const endStr   = str.slice(slash + 1);

  const rawTzid = params['TZID'];
  const tzid  = rawTzid ? (Array.isArray(rawTzid) ? rawTzid[0] : rawTzid) : null;
  const start = parseDateTime(startStr, tzid);

  if (endStr.startsWith('P') || endStr.startsWith('-P') || endStr.startsWith('+P')) {
    return { start, duration: parseDuration(endStr) };
  }
  return { start, end: parseDateTime(endStr, tzid) };
}

// ---------------------------------------------------------------------------
// RECUR  (Section 3.3.10)
// Parses an RRULE value string into a structured object.
// Returns: {
//   freq, until?, count?, interval, bysecond, byminute, byhour,
//   byday, bymonthday, byyearday, byweekno, bymonth, bysetpos, wkst
// }
// ---------------------------------------------------------------------------
export function parseRecur(str) {
  const parts = str.split(';');
  const rule = {
    freq:       null,
    until:      null,   // DateTime or Date
    count:      null,
    interval:   1,
    bysecond:   null,   // number[]
    byminute:   null,
    byhour:     null,
    byday:      null,   // { nth: number|null, day: string }[]
    bymonthday: null,   // number[] (can be negative)
    byyearday:  null,
    byweekno:   null,
    bymonth:    null,
    bysetpos:   null,
    wkst:       'MO',
  };

  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).toUpperCase();
    const val = part.slice(eq + 1);

    switch (key) {
      case 'FREQ':     rule.freq = val.toUpperCase(); break;
      case 'INTERVAL': rule.interval = parseInt(val, 10); break;
      case 'COUNT':    rule.count = parseInt(val, 10); break;
      case 'WKST':     rule.wkst = val.toUpperCase(); break;
      case 'UNTIL':
        rule.until = val.includes('T') ? parseDateTime(val) : parseDate(val);
        break;

      case 'BYSECOND':   rule.bysecond   = val.split(',').map(Number); break;
      case 'BYMINUTE':   rule.byminute   = val.split(',').map(Number); break;
      case 'BYHOUR':     rule.byhour     = val.split(',').map(Number); break;
      case 'BYMONTHDAY': rule.bymonthday = val.split(',').map(Number); break;
      case 'BYYEARDAY':  rule.byyearday  = val.split(',').map(Number); break;
      case 'BYWEEKNO':   rule.byweekno   = val.split(',').map(Number); break;
      case 'BYMONTH':    rule.bymonth    = val.split(',').map(Number); break;
      case 'BYSETPOS':   rule.bysetpos   = val.split(',').map(Number); break;

      case 'BYDAY':
        rule.byday = val.split(',').map(parseBydayToken);
        break;
    }
  }

  if (!rule.freq) throw new Error(`RRULE missing FREQ: ${str}`);
  return rule;
}

/** Parse a single BYDAY token like "MO", "2TH", "-1FR" */
function parseBydayToken(token) {
  const m = token.match(/^([+-]?\d+)?([A-Z]{2})$/);
  if (!m) throw new Error(`Invalid BYDAY token: ${token}`);
  return { nth: m[1] != null ? parseInt(m[1], 10) : null, day: m[2] };
}

/** Format a parsed RECUR back to string */
export function formatRecur(rule) {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.until) {
    if (rule.until.hour !== undefined) {
      const dt = rule.until;
      parts.push(`UNTIL=${pad(dt.year,4)}${pad(dt.month,2)}${pad(dt.day,2)}T${pad(dt.hour,2)}${pad(dt.minute,2)}${pad(dt.second,2)}${dt.utc ? 'Z' : ''}`);
    } else {
      const d = rule.until;
      parts.push(`UNTIL=${pad(d.year,4)}${pad(d.month,2)}${pad(d.day,2)}`);
    }
  }
  if (rule.count    != null) parts.push(`COUNT=${rule.count}`);
  if (rule.interval !== 1)   parts.push(`INTERVAL=${rule.interval}`);
  if (rule.bysecond)   parts.push(`BYSECOND=${rule.bysecond.join(',')}`);
  if (rule.byminute)   parts.push(`BYMINUTE=${rule.byminute.join(',')}`);
  if (rule.byhour)     parts.push(`BYHOUR=${rule.byhour.join(',')}`);
  if (rule.byday)      parts.push(`BYDAY=${rule.byday.map(b => (b.nth != null ? b.nth : '') + b.day).join(',')}`);
  if (rule.bymonthday) parts.push(`BYMONTHDAY=${rule.bymonthday.join(',')}`);
  if (rule.byyearday)  parts.push(`BYYEARDAY=${rule.byyearday.join(',')}`);
  if (rule.byweekno)   parts.push(`BYWEEKNO=${rule.byweekno.join(',')}`);
  if (rule.bymonth)    parts.push(`BYMONTH=${rule.bymonth.join(',')}`);
  if (rule.bysetpos)   parts.push(`BYSETPOS=${rule.bysetpos.join(',')}`);
  if (rule.wkst !== 'MO') parts.push(`WKST=${rule.wkst}`);
  return parts.join(';');
}

// ---------------------------------------------------------------------------
// TEXT  (Section 3.3.11)
// Unescape: \\ -> \, \n -> newline, \, -> comma, \; -> semicolon
// ---------------------------------------------------------------------------
export function parseText(str) {
  return str
    .replace(/\\N/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\x00')  // protect \\
    .replace(/\\,/g,  ',')
    .replace(/\\;/g,  ';')
    .replace(/\x00/g, '\\');
}

export function escapeText(str) {
  return str
    .replace(/\\/g,  '\\\\')
    .replace(/\n/g,  '\\n')
    .replace(/,/g,   '\\,')
    .replace(/;/g,   '\\;');
}

// ---------------------------------------------------------------------------
// UTC-OFFSET  (Section 3.3.14)
// Format: (+|-)HHMM[SS]
// Returns: total minutes (signed)
// ---------------------------------------------------------------------------
export function parseUTCOffset(str) {
  const m = str.match(/^([+-])(\d{2})(\d{2})(\d{2})?$/);
  if (!m) throw new Error(`Invalid UTC-OFFSET: ${str}`);
  const sign = m[1] === '+' ? 1 : -1;
  const mins = parseInt(m[2], 10) * 60 + parseInt(m[3], 10)
             + (m[4] ? parseInt(m[4], 10) / 60 : 0);
  return sign * mins;
}

export function formatUTCOffset(minutes) {
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${pad(h, 2)}${pad(m, 2)}`;
}

// ---------------------------------------------------------------------------
// GEO  (Section 3.8.1.6)
// Format: "lat;lon"
// Returns: { lat, lon }
// ---------------------------------------------------------------------------
export function parseGeo(str) {
  const parts = str.split(';');
  if (parts.length !== 2) throw new Error(`Invalid GEO: ${str}`);
  return { lat: parseFloat(parts[0]), lon: parseFloat(parts[1]) };
}

// ---------------------------------------------------------------------------
// INTEGER / FLOAT / BOOLEAN / URI / CAL-ADDRESS  (simple wrappers)
// ---------------------------------------------------------------------------
export const parseInteger    = (s) => parseInt(s.trim(), 10);
export const parseFloat_     = (s) => parseFloat(s.trim());
export const parseBoolean    = (s) => s.trim().toUpperCase() === 'TRUE';
export const parseURI        = (s) => s.trim();
export const parseCalAddress = (s) => s.trim();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pad(n, width) {
  return String(n).padStart(width, '0');
}
