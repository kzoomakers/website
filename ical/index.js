/**
 * ical.js - RFC 5545 iCalendar Library
 *
 * Public API surface.  Import from this file:
 *
 *   import { parse, serialize, expandEvent, expandAllEvents, buildRegistry }
 *     from './ical/index.js';
 */

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------
export { parseICS, unfoldLines, parseContentLine, getProp, getProps, getValue, getParam }
  from './parser.js';

// ---------------------------------------------------------------------------
// Model - component wrappers
// ---------------------------------------------------------------------------
export {
  Component, Property,
  VCalendar, VEvent, VTodo, VJournal, VFreeBusy, VTimezone, TZObservance, VAlarm,
  wrapComponent,
} from './model.js';

// ---------------------------------------------------------------------------
// Value parsers / formatters
// ---------------------------------------------------------------------------
export {
  parseDate,      dateToJSDate,
  parseDateTime,  dateTimeToJSDate,
  parseDateOrDateTime,
  parseDuration,  formatDuration,
  parsePeriod,
  parseRecur,     formatRecur,
  parseText,      escapeText,
  parseUTCOffset, formatUTCOffset,
  parseGeo,
  parseInteger,
  parseFloat_,
  parseBoolean,
  parseURI,
  parseCalAddress,
} from './values.js';

// ---------------------------------------------------------------------------
// Recurrence engine
// ---------------------------------------------------------------------------
export { expandRRule, expandEvent, expandAllEvents } from './recurrence.js';

// ---------------------------------------------------------------------------
// Timezone registry
// ---------------------------------------------------------------------------
export { TZRegistry, buildRegistry } from './timezone.js';

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------
export { serialize, foldLine, buildCalendar } from './serializer.js';

// ---------------------------------------------------------------------------
// Convenience: parse text -> VCalendar with timezone registry
// ---------------------------------------------------------------------------
import { parseICS as _parseICS }         from './parser.js';
import { wrapComponent as _wrap }        from './model.js';
import { buildRegistry as _buildReg }    from './timezone.js';
import { VCalendar as _VCalendar }       from './model.js';

/**
 * High-level parse function.
 * Returns: { calendar: VCalendar, tzRegistry: TZRegistry, raw: object }
 *
 * @param {string} icsText  - Raw ICS file content
 */
export function parse(icsText) {
  const raw      = _parseICS(icsText);
  const calendar = _wrap(Array.isArray(raw) ? raw[0] : raw);
  const tzReg    = _buildReg(Array.isArray(raw) ? raw[0] : raw);
  return { calendar, tzRegistry: tzReg, raw: Array.isArray(raw) ? raw[0] : raw };
}
