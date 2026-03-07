/**
 * RFC 5545 §3.3.10 - Recurrence Rule Expansion Engine
 *
 * Full implementation of all FREQ values, all BY* rules, BYSETPOS, WKST,
 * COUNT, UNTIL, and INTERVAL.
 *
 * Also handles:
 *  - RDATE (adds instances to the set)
 *  - EXDATE (removes instances from the set)
 *  - RECURRENCE-ID overrides (replaces a specific instance with a modified event)
 *
 * The core entry point is expandRRule() which returns an array of JS Date
 * objects representing each recurrence instance within the given window.
 */

// Day-of-week name -> number (ISO: MO=1 ... SU=7; internally we use 0=SU for getDay())
const DAY_NUM = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const DAY_NAME = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// ---------------------------------------------------------------------------
// Public: expand a single RRULE
// ---------------------------------------------------------------------------

/**
 * Expand an RRULE into an array of JS Date instances.
 *
 * @param {object}  rule        - Parsed RECUR object from values.parseRecur()
 * @param {Date}    dtstart     - The DTSTART of the event (JS Date)
 * @param {Date}    [windowStart] - Only include instances on/after this (default: dtstart)
 * @param {Date}    [windowEnd]   - Only include instances on/before this (default: 1 year from now)
 * @param {number}  [maxCount]  - Hard cap on number of instances returned (default 5000)
 * @param {Date[]}  [exdates]   - Excluded dates
 * @param {object}  [tzReg]     - TZRegistry (optional; used for UNTIL resolution if TZID)
 * @param {boolean} [floatingExpand] - If true, treat dtstart as UTC-epoch for pure arithmetic
 * @returns {Date[]}
 */
export function expandRRule(rule, dtstart,
    windowStart = null, windowEnd = null, maxCount = null,
    exdates = [], tzReg = null, floatingExpand = false) {

  const rruleCount = rule.count;
  const interval   = rule.interval || 1;
  const wkst       = DAY_NUM[rule.wkst || 'MO'];

  // Resolve UNTIL to a comparable timestamp
  let untilMs = Infinity;
  if (rule.until) {
    const u = rule.until;
    let untilDate;
    if (u.hour !== undefined) {
      // DATE-TIME
      if (u.utc) {
        untilDate = new Date(Date.UTC(u.year, u.month-1, u.day, u.hour, u.minute, u.second));
      } else {
        untilDate = new Date(u.year, u.month-1, u.day, u.hour, u.minute, u.second);
      }
    } else {
      untilDate = new Date(u.year, u.month-1, u.day);
    }
    untilMs = untilDate.getTime();
  }

  const winStart = windowStart ? windowStart.getTime() : dtstart.getTime();
  const winEnd   = windowEnd   ? windowEnd.getTime()   : Infinity;
  const hardMax  = maxCount    ? Math.min(maxCount, 5000) : 5000;

  const exdateSet = buildExdateSet(exdates);
  const instances = [];

  // -----------------------------------------------------------------------
  // Generate candidates using frequency iteration, then filter with BY* rules
  // -----------------------------------------------------------------------
  let current  = new Date(dtstart);
  let genCount = 0;    // total generated (against COUNT limit)
  let iter     = 0;    // safety counter
  const MAX_ITER = 50000;

  while (iter++ < MAX_ITER) {
    const curMs = current.getTime();

    // Stop if we've exceeded UNTIL
    if (curMs > untilMs) break;

    // Stop if we've exceeded the window and we have at least one result
    if (curMs > winEnd && instances.length > 0) break;

    // Expand the current "seed" date according to BY* filters
    const candidates = expandBY(rule, current, dtstart, wkst);

    for (const cand of candidates) {
      const ms = cand.getTime();

      if (ms < dtstart.getTime()) continue; // never before DTSTART
      if (ms > untilMs) { genCount++; break; }

      // Per RFC, COUNT counts from DTSTART (including it), not just window
      if (rruleCount != null && genCount >= rruleCount) {
        return instances;
      }

      genCount++;

      if (ms >= winStart && ms <= winEnd && !isExcluded(cand, exdateSet)) {
        instances.push(cand);
        if (instances.length >= hardMax) return instances;
      }
    }

    if (rruleCount != null && genCount >= rruleCount) break;

    // Advance by interval
    advance(current, rule.freq, interval);
  }

  return instances;
}

// ---------------------------------------------------------------------------
// BY* expansion for a single "seed" datetime
// ---------------------------------------------------------------------------

/**
 * Given a seed date (already stepped by FREQ/INTERVAL), expand it
 * according to the BY* rules in the order specified by RFC 5545 §3.3.10.
 *
 * Returns an array of candidate JS Dates for this iteration.
 * They are further filtered (UNTIL, COUNT, window) by the caller.
 */
function expandBY(rule, seed, dtstart, wkst) {
  const freq = rule.freq;

  // Start with the seed
  let set = [new Date(seed)];

  // After BYMONTH expands in YEARLY context, BYDAY/BYMONTHDAY should operate
  // within each named month (monthly scope), not across the whole year.
  let dayScope = freq;

  // BYMONTH
  // RFC §3.3.10 table: EXPAND for YEARLY, LIMIT for all other frequencies.
  if (rule.bymonth) {
    if (freq === 'YEARLY') {
      // Expand: generate one seed per specified month, preserving time and
      // day-of-month (clamped to the target month's length).
      const expanded = [];
      for (const d of set) {
        for (const mo of rule.bymonth) {
          const origDay  = d.getDate();
          const daysInMo = new Date(d.getFullYear(), mo, 0).getDate();
          expanded.push(new Date(
            d.getFullYear(), mo - 1, Math.min(origDay, daysInMo),
            d.getHours(), d.getMinutes(), d.getSeconds(), 0
          ));
        }
      }
      set = dedup(expanded.sort((a, b) => a.getTime() - b.getTime()));
      // Now that months are fixed, BYDAY/BYMONTHDAY act per-month.
      dayScope = 'MONTHLY';
    } else {
      // Limit: keep only seeds whose month is in the list.
      set = set.filter(d => rule.bymonth.includes(d.getMonth() + 1));
    }
    if (set.length === 0) return [];
  }

  // BYWEEKNO – applies to YEARLY only
  if (rule.byweekno && freq === 'YEARLY') {
    set = expandByWeekNo(set, rule.byweekno, wkst);
    if (set.length === 0) return [];
  }

  // BYYEARDAY
  if (rule.byyearday) {
    set = expandByYearDay(set, rule.byyearday);
    if (set.length === 0) return [];
  }

  // BYMONTHDAY – use dayScope so post-BYMONTH expansion stays per-month
  if (rule.bymonthday) {
    set = expandByMonthDay(set, rule.bymonthday);
    if (set.length === 0) return [];
  }

  // BYDAY – use dayScope for correct YEARLY vs MONTHLY expansion
  if (rule.byday) {
    set = expandByDay(set, rule.byday, dayScope, wkst, dtstart);
    if (set.length === 0) return [];
  }

  // BYHOUR
  if (rule.byhour) {
    set = expandByTimeComponent(set, rule.byhour, 'hour');
    if (set.length === 0) return [];
  }

  // BYMINUTE
  if (rule.byminute) {
    set = expandByTimeComponent(set, rule.byminute, 'minute');
    if (set.length === 0) return [];
  }

  // BYSECOND
  if (rule.bysecond) {
    set = expandByTimeComponent(set, rule.bysecond, 'second');
    if (set.length === 0) return [];
  }

  // Sort the set
  set.sort((a, b) => a.getTime() - b.getTime());

  // BYSETPOS – select positions from the set
  if (rule.bysetpos) {
    set = applyBySetPos(set, rule.bysetpos);
  }

  return set;
}

// ---------------------------------------------------------------------------
// Individual BY* expanders
// ---------------------------------------------------------------------------

function expandByWeekNo(set, byweekno, wkst) {
  const result = [];
  for (const d of set) {
    for (const wn of byweekno) {
      const target = nthWeekOfYear(d.getFullYear(), wn, wkst);
      if (target) result.push(new Date(target));
    }
  }
  return result;
}

function expandByYearDay(set, byyearday) {
  const result = [];
  for (const d of set) {
    const daysInYear = isLeapYear(d.getFullYear()) ? 366 : 365;
    for (const yd of byyearday) {
      const actual = yd > 0 ? yd : daysInYear + yd + 1;
      const jan1   = new Date(d.getFullYear(), 0, 1);
      const target = new Date(jan1);
      target.setDate(jan1.getDate() + actual - 1);
      // Preserve time
      target.setHours(d.getHours(), d.getMinutes(), d.getSeconds(), 0);
      result.push(target);
    }
  }
  return result;
}

// Note: `freq` parameter removed — callers now pass `dayScope` so that
// BYMONTH-constrained YEARLY rules are already narrowed to per-month.
function expandByMonthDay(set, bymonthday) {
  const result = [];
  for (const d of set) {
    const year = d.getFullYear();
    const mo   = d.getMonth() + 1;
    const dim  = new Date(year, mo, 0).getDate(); // days in this month
    for (const mday of bymonthday) {
      const actual = mday > 0 ? mday : dim + mday + 1;
      if (actual < 1 || actual > dim) continue;
      result.push(new Date(year, mo - 1, actual,
                           d.getHours(), d.getMinutes(), d.getSeconds(), 0));
    }
  }
  return dedup(result);
}

function expandByDay(set, byday, freq, wkst, dtstart) {
  const result = [];

  for (const d of set) {
    for (const rule of byday) {
      const dayNum = DAY_NUM[rule.day];

      if (rule.nth == null) {
        if (freq === 'WEEKLY') {
          // Expand: all occurrences of this day-of-week within the week that contains d.
          // "Week" boundaries follow WKST. We generate dates for each BYDAY match
          // within the 7-day span starting at the WKST-aligned start of this week.
          const weekStart = startOfWeekAt(d, wkst);
          for (let offset = 0; offset < 7; offset++) {
            const cand = new Date(weekStart);
            cand.setDate(weekStart.getDate() + offset);
            cand.setHours(d.getHours(), d.getMinutes(), d.getSeconds(), 0);
            if (cand.getDay() === dayNum) result.push(cand);
          }
        } else if (freq === 'DAILY' || freq === 'HOURLY'
                || freq === 'MINUTELY' || freq === 'SECONDLY') {
          // Limit: only include if day-of-week matches
          if (d.getDay() === dayNum) result.push(new Date(d));
        } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
          // Expand: all occurrences of this day in the month (MONTHLY) or year (YEARLY)
          const candidates = allDayInScope(d, dayNum, freq, wkst);
          result.push(...candidates);
        }
      } else {
        // Ordinal: nth occurrence of weekday in month (MONTHLY) or year (YEARLY)
        const nd = nthWeekdayInScope(d, rule.nth, dayNum, freq);
        if (nd) result.push(nd);
      }
    }
  }
  return dedup(result);
}

/** Return a Date for the start of the week containing `d`, where weeks start on `wkst` day number */
function startOfWeekAt(d, wkst) {
  const dow    = d.getDay(); // 0=SU..6=SA
  const offset = (dow - wkst + 7) % 7;
  const start  = new Date(d);
  start.setDate(d.getDate() - offset);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** All occurrences of weekday `dayNum` in the month (MONTHLY) or year (YEARLY) of `d` */
function allDayInScope(d, dayNum, freq, wkst) {
  const results = [];
  if (freq === 'MONTHLY') {
    const year  = d.getFullYear();
    const month = d.getMonth();
    const dim   = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= dim; day++) {
      const nd = new Date(year, month, day, d.getHours(), d.getMinutes(), d.getSeconds(), 0);
      if (nd.getDay() === dayNum) results.push(nd);
    }
  } else {
    // YEARLY
    const year = d.getFullYear();
    const diy  = isLeapYear(year) ? 366 : 365;
    for (let yd = 1; yd <= diy; yd++) {
      const nd = new Date(year, 0, yd, d.getHours(), d.getMinutes(), d.getSeconds(), 0);
      if (nd.getDay() === dayNum) results.push(nd);
    }
  }
  return results;
}

/** The nth occurrence (positive or negative) of weekday in month/year */
function nthWeekdayInScope(d, nth, dayNum, freq) {
  const all = allDayInScope(d, dayNum, freq, 1 /* wkst not relevant here */);
  if (all.length === 0) return null;
  const idx = nth > 0 ? nth - 1 : all.length + nth;
  return all[idx] || null;
}

function expandByTimeComponent(set, values, component) {
  const result = [];
  for (const d of set) {
    for (const v of values) {
      const nd = new Date(d);
      if (component === 'hour')   nd.setHours(v);
      if (component === 'minute') nd.setMinutes(v);
      if (component === 'second') nd.setSeconds(v);
      nd.setMilliseconds(0);
      result.push(nd);
    }
  }
  return result;
}

function applyBySetPos(set, bysetpos) {
  const result = [];
  for (const pos of bysetpos) {
    const idx = pos > 0 ? pos - 1 : set.length + pos;
    if (idx >= 0 && idx < set.length) result.push(set[idx]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Advance a date by FREQ/INTERVAL  (mutates `d`)
// ---------------------------------------------------------------------------
function advance(d, freq, interval) {
  switch (freq) {
    case 'SECONDLY': d.setSeconds(d.getSeconds() + interval); break;
    case 'MINUTELY': d.setMinutes(d.getMinutes() + interval); break;
    case 'HOURLY':   d.setHours(d.getHours() + interval); break;
    case 'DAILY':    d.setDate(d.getDate() + interval); break;
    case 'WEEKLY':   d.setDate(d.getDate() + 7 * interval); break;
    case 'MONTHLY':  addMonths(d, interval); break;
    case 'YEARLY':   d.setFullYear(d.getFullYear() + interval); break;
  }
}

/** Add months without losing day precision (clamp to end of month) */
function addMonths(d, n) {
  const origDay = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(origDay, dim));
}

// ---------------------------------------------------------------------------
// BYWEEKNO helper
// ---------------------------------------------------------------------------

/**
 * ISO 8601-like week numbering, but respecting WKST.
 * Returns the Date of the first day of week `wn` in year `year`.
 */
function nthWeekOfYear(year, wn, wkst) {
  if (wn === 0) return null;

  // Find Jan 4 (always in week 1 for ISO)
  const jan4 = new Date(year, 0, 4);
  // Start of week 1
  const dow  = (jan4.getDay() - wkst + 7) % 7;
  const week1Start = new Date(jan4);
  week1Start.setDate(jan4.getDate() - dow);

  if (wn > 0) {
    const target = new Date(week1Start);
    target.setDate(week1Start.getDate() + (wn - 1) * 7);
    return target.getFullYear() === year ? target : null;
  } else {
    // Negative: count from end of year
    const dec28 = new Date(year, 11, 28);
    const dow2  = (dec28.getDay() - wkst + 7) % 7;
    const lastWeekStart = new Date(dec28);
    lastWeekStart.setDate(dec28.getDate() - dow2);
    const target = new Date(lastWeekStart);
    target.setDate(lastWeekStart.getDate() + (wn + 1) * 7); // wn is negative
    return target.getFullYear() === year ? target : null;
  }
}

// ---------------------------------------------------------------------------
// Full recurrence set: RRULE instances + RDATE - EXDATE  (Section 3.8.5)
// ---------------------------------------------------------------------------

/**
 * Compute the full recurrence set for a VEvent.
 *
 * @param {VEvent}   vevent
 * @param {Date}     windowStart
 * @param {Date}     windowEnd
 * @param {TZRegistry} [tzReg]
 * @param {number}   [maxCount]
 * @returns {Date[]}  - Sorted, deduplicated list of instance start times
 */
export function expandEvent(vevent, windowStart, windowEnd, tzReg = null, maxCount = 2000) {
  const dtstart = vevent.dtstart(tzReg);
  if (!dtstart) return [];

  // Collect EXDATE timestamps for quick lookup
  const exdateTimes = vevent.exdates.map(x => {
    const ms = x.jsDate ? x.jsDate.getTime() : null;
    return ms;
  }).filter(ms => ms != null);
  const exdateSet = new Set(exdateTimes);

  let instances = [];

  // 1. RRULE instances
  for (const rrule of vevent.rrules) {
    const expanded = expandRRule(rrule, dtstart, windowStart, windowEnd,
                                 maxCount, [], tzReg);
    instances.push(...expanded);
  }

  // 2. RDATE instances
  for (const rd of vevent.rdates) {
    if (rd.jsDate) {
      const ms = rd.jsDate.getTime();
      if (ms >= windowStart.getTime() && ms <= windowEnd.getTime()) {
        instances.push(rd.jsDate);
      }
    }
  }

  // 3. If there are no RRULE or RDATE, but there is a plain DTSTART, include it
  if (vevent.rrules.length === 0 && vevent.rdates.length === 0) {
    const ms = dtstart.getTime();
    if (ms >= windowStart.getTime() && ms <= windowEnd.getTime()) {
      instances.push(dtstart);
    }
  }

  // 4. Remove EXDATE instances
  instances = instances.filter(d => !exdateSet.has(d.getTime()));

  // Also handle EXRULE (deprecated but still seen in the wild)
  for (const exrule of vevent.exrules) {
    const exInstances = expandRRule(exrule, dtstart, windowStart, windowEnd, maxCount, [], tzReg);
    const exSet = new Set(exInstances.map(d => d.getTime()));
    instances = instances.filter(d => !exSet.has(d.getTime()));
  }

  // 5. Sort and deduplicate
  instances.sort((a, b) => a.getTime() - b.getTime());
  return dedup(instances);
}

// ---------------------------------------------------------------------------
// RECURRENCE-ID overrides  (Section 3.8.4.4)
// ---------------------------------------------------------------------------

/**
 * Given a list of VEvent objects (from a VCALENDAR), merge RECURRENCE-ID
 * override events into the expanded set.
 *
 * Returns an array of { start: Date, vevent: VEvent, isOverride: boolean }
 * objects covering the given window.
 *
 * @param {VEvent[]} events    - All VEvent objects from the VCALENDAR
 * @param {Date}     windowStart
 * @param {Date}     windowEnd
 * @param {object}   [tzReg]
 * @param {number}   [maxCount]
 */
export function expandAllEvents(events, windowStart, windowEnd,
    tzReg = null, maxCount = 2000) {

  // Separate master events from overrides
  const masters   = events.filter(e => !e.recurrenceIdProp);
  const overrides = events.filter(e => e.recurrenceIdProp);

  // Build a map: uid -> override VEvent[]
  const overrideMap = new Map();
  for (const ov of overrides) {
    const uid = ov.uid;
    if (!overrideMap.has(uid)) overrideMap.set(uid, []);
    overrideMap.get(uid).push(ov);
  }

  const result = [];

  for (const master of masters) {
    const uid      = master.uid;
    const uid_ovs  = overrideMap.get(uid) || [];

    // Build a set of recurrence-id timestamps that have overrides
    const overriddenMs = new Set(
      uid_ovs.map(ov => ov.recurrenceId?.getTime()).filter(t => t != null)
    );

    if (master.isRecurring) {
      // Collect EXDATE timestamps from master (already handled in expandEvent,
      // but we also need to exclude overridden instances)
      const expandedStarts = expandEvent(master, windowStart, windowEnd, tzReg, maxCount);

      for (const start of expandedStarts) {
        const ms = start.getTime();
        if (overriddenMs.has(ms)) continue; // replaced by an override

        result.push({ start, vevent: master, isOverride: false });
      }
    } else {
      // Single instance
      const start = master.dtstart(tzReg);
      if (start) {
        const ms = start.getTime();
        if (!overriddenMs.has(ms) &&
            ms >= windowStart.getTime() && ms <= windowEnd.getTime()) {
          result.push({ start, vevent: master, isOverride: false });
        }
      }
    }

    // Add override instances
    for (const ov of uid_ovs) {
      const start = ov.dtstart(tzReg);
      if (!start) continue;
      const ms = start.getTime();
      if (ms >= windowStart.getTime() && ms <= windowEnd.getTime()) {
        result.push({ start, vevent: ov, isOverride: true });
      }
    }
  }

  result.sort((a, b) => a.start.getTime() - b.start.getTime());
  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function buildExdateSet(exdates) {
  const s = new Set();
  for (const d of exdates) {
    if (d instanceof Date) s.add(d.getTime());
    else if (d && typeof d.getTime === 'function') s.add(d.getTime());
  }
  return s;
}

function isExcluded(date, exdateSet) {
  return exdateSet.has(date.getTime());
}

/** Remove duplicate Date objects (by timestamp) from a sorted array */
function dedup(dates) {
  if (dates.length === 0) return dates;
  const out = [dates[0]];
  for (let i = 1; i < dates.length; i++) {
    if (dates[i].getTime() !== out[out.length - 1].getTime()) {
      out.push(dates[i]);
    }
  }
  return out;
}
