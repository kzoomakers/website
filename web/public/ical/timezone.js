/**
 * RFC 5545 §3.6.5 VTIMEZONE - Timezone Resolution
 *
 * Parses VTIMEZONE components into transition tables and resolves
 * TZID + local-time pairs to UTC offsets (in minutes).
 */

import { VTimezone } from './model.js';
import { dateTimeToJSDate, parseDateTime } from './values.js';
import { expandRRule } from './recurrence.js';

// ---------------------------------------------------------------------------
// TZRegistry - holds all VTIMEZONE data from a VCALENDAR
// ---------------------------------------------------------------------------
export class TZRegistry {
  constructor() {
    this._zones = new Map(); // TZID -> TransitionTable
  }

  /** Register a VTimezone instance */
  register(vtz) {
    const tzid = vtz.tzid;
    if (!tzid) return;
    const table = buildTransitionTable(vtz);
    this._zones.set(tzid, table);
  }

  /** Register all VTIMEZONE children from a VCalendar raw object */
  registerAll(vcalendar) {
    for (const child of vcalendar.children || []) {
      if (child.name === 'VTIMEZONE') {
        const vtz = new VTimezone(child);
        this.register(vtz);
      }
    }
  }

  /** Get offset in minutes for a given TZID at a particular local datetime.
   *  The datetime parameter is an object { year, month, day, hour, minute, second }
   *  as returned by parseDateTime() (with floating=true or tzid set). */
  offsetAt(tzid, dt) {
    const table = this._zones.get(tzid);
    if (!table || table.length === 0) return 0;

    // Use a wall-clock millisecond value for comparison
    // We compare using UTC epoch as if the time were UTC (for ordering transitions)
    const wallMs = Date.UTC(dt.year, dt.month - 1, dt.day,
                            dt.hour, dt.minute, dt.second);

    // Binary-search the transition table for the correct observance
    // Transition times in the table are stored as UTC milliseconds
    let best = table[0];
    for (const t of table) {
      if (t.utcMs <= wallMs) {
        best = t;
      } else {
        break;
      }
    }
    return best.offsetTo; // minutes
  }

  /** Convert a floating local datetime (object or JS Date) + TZID to a UTC JS Date */
  toUTC(dt, tzid) {
    if (dt instanceof Date) {
      // Treat the Date as a "local" time in the given zone
      const d = {
        year: dt.getFullYear(), month: dt.getMonth() + 1, day: dt.getDate(),
        hour: dt.getHours(),   minute: dt.getMinutes(), second: dt.getSeconds(),
      };
      const offset = this.offsetAt(tzid, d);
      return new Date(dt.getTime() - offset * 60000);
    }
    const offset = this.offsetAt(tzid, dt);
    const localMs = Date.UTC(dt.year, dt.month - 1, dt.day,
                             dt.hour, dt.minute, dt.second);
    return new Date(localMs - offset * 60000);
  }

  /** Convert a UTC JS Date to local time in the given TZID; returns a Date */
  fromUTC(utcDate, tzid) {
    const table = this._zones.get(tzid);
    if (!table || table.length === 0) return utcDate;

    const utcMs = utcDate.getTime();
    let best = table[0];
    for (const t of table) {
      if (t.utcMs <= utcMs) best = t;
      else break;
    }
    return new Date(utcMs + best.offsetTo * 60000);
  }

  has(tzid) { return this._zones.has(tzid); }
}

// ---------------------------------------------------------------------------
// Build a sorted list of transitions from a VTimezone
// ---------------------------------------------------------------------------

/**
 * Transition: { utcMs: number, offsetTo: number (minutes), name: string }
 * utcMs is the UTC millisecond timestamp at which this observance begins.
 */
function buildTransitionTable(vtz) {
  const transitions = [];

  const observances = [...vtz.standard, ...vtz.daylight];
  for (const obs of observances) {
    const dtstart = obs.dtstartRaw;
    if (!dtstart) continue;

    const offsetFrom = obs.tzOffsetFrom; // minutes
    const offsetTo   = obs.tzOffsetTo;   // minutes
    const name       = obs.tzname || '';

    // DTSTART in VTIMEZONE observances is always a floating local time
    // relative to TZOFFSETFROM.  Convert to UTC:
    const localMs = Date.UTC(dtstart.year, dtstart.month - 1, dtstart.day,
                             dtstart.hour, dtstart.minute, dtstart.second);
    const firstUTC = localMs - offsetFrom * 60000;

    // Push the initial (DTSTART) transition
    transitions.push({ utcMs: firstUTC, offsetTo, name });

    // Expand RRULE transitions (VTIMEZONE uses RRULE too)
    for (const rrule of obs.rrules) {
      // We expand up to 100 years from the DTSTART for practical coverage
      const horizon = new Date(firstUTC + 100 * 365.25 * 86400 * 1000);

      // Build a synthetic "floating" dtstart for the expander
      const syntheticDTStart = new Date(localMs); // treat as UTC for expansion
      const instances = expandRRule(rrule, syntheticDTStart, null,
                                    horizon, null, [], null, true);

      for (const inst of instances) {
        const instLocalMs = inst.getTime();
        const instUTC = instLocalMs - offsetFrom * 60000;
        if (instUTC !== firstUTC) { // don't duplicate first
          transitions.push({ utcMs: instUTC, offsetTo, name });
        }
      }
    }

    // RDATE observances (less common but RFC-compliant)
    for (const rd of obs.rdates) {
      const rdMs = rd.jsDate ? rd.jsDate.getTime() : null;
      if (rdMs == null) continue;
      const rdUTC = rdMs - offsetFrom * 60000;
      if (rdUTC !== firstUTC) {
        transitions.push({ utcMs: rdUTC, offsetTo, name });
      }
    }
  }

  // Sort by UTC timestamp ascending
  transitions.sort((a, b) => a.utcMs - b.utcMs);
  return transitions;
}

// ---------------------------------------------------------------------------
// Convenience: build a TZRegistry from a raw VCALENDAR component object
// ---------------------------------------------------------------------------
export function buildRegistry(vcalendar) {
  const reg = new TZRegistry();
  reg.registerAll(vcalendar);
  return reg;
}
