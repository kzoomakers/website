/**
 * RFC 5545 Component/Property Model
 *
 * Wraps the raw parser output (plain objects from parser.js) in rich classes
 * that provide typed accessors for all standard RFC 5545 properties.
 */

import {
  parseDate, dateToJSDate,
  parseDateTime, dateTimeToJSDate,
  parseDateOrDateTime,
  parseDuration,
  parsePeriod,
  parseRecur,
  parseText,
  parseUTCOffset,
  parseGeo,
  parseInteger,
  parseBoolean,
  parseURI,
  parseCalAddress,
} from './values.js';
import { getParam } from './parser.js';

// ---------------------------------------------------------------------------
// Property wrapper
// ---------------------------------------------------------------------------

export class Property {
  constructor(raw) {
    this._raw = raw; // { name, params, value }
  }

  get name()   { return this._raw.name; }
  get params() { return this._raw.params; }
  get value()  { return this._raw.value; }

  /** Get a parameter value (first in list) */
  param(name) { return getParam(this._raw, name); }

  /** Typed accessors */
  asText()        { return parseText(this._raw.value); }
  asDate()        { return parseDate(this._raw.value); }
  asDateTime()    { return parseDateTime(this._raw.value, this.param('TZID')); }
  asDateOrDT()    { return parseDateOrDateTime(this._raw.value, this._raw.params); }
  asDuration()    { return parseDuration(this._raw.value); }
  asPeriod()      { return parsePeriod(this._raw.value, this._raw.params); }
  asRecur()       { return parseRecur(this._raw.value); }
  asUTCOffset()   { return parseUTCOffset(this._raw.value); }
  asGeo()         { return parseGeo(this._raw.value); }
  asInteger()     { return parseInteger(this._raw.value); }
  asBoolean()     { return parseBoolean(this._raw.value); }
  asURI()         { return parseURI(this._raw.value); }
  asCalAddress()  { return parseCalAddress(this._raw.value); }

  /** JS Date (best-effort) */
  asJSDate(tzRegistry = null) {
    const dOrDT = parseDateOrDateTime(this._raw.value, this._raw.params);
    if (dOrDT.isDate) return dOrDT.jsDate;
    return dateTimeToJSDate(dOrDT.dateTime, tzRegistry);
  }
}

// ---------------------------------------------------------------------------
// Component base class
// ---------------------------------------------------------------------------

export class Component {
  /**
   * @param {object} raw - Output from parser.js parseICS() or a plain object
   *                       { name, properties, children }
   */
  constructor(raw) {
    this._raw = raw;
  }

  get name()     { return this._raw.name; }
  get rawProps() { return this._raw.properties; }

  /** Get the first Property with name, or null */
  prop(name) {
    const arr = this._raw.properties[name.toUpperCase()];
    return arr ? new Property(arr[0]) : null;
  }

  /** Get all Properties with name */
  props(name) {
    const arr = this._raw.properties[name.toUpperCase()];
    return arr ? arr.map(r => new Property(r)) : [];
  }

  /** Typed first-value shortcuts */
  text(name)     { return this.prop(name)?.asText()    ?? null; }
  integer(name)  { return this.prop(name)?.asInteger() ?? null; }

  /** Child components (wrapped) */
  get children() {
    return this._raw.children.map(wrapComponent);
  }

  /** First child with a given name */
  child(name) {
    const raw = this._raw.children.find(c => c.name === name.toUpperCase());
    return raw ? wrapComponent(raw) : null;
  }

  /** All children with a given name */
  childrenOf(name) {
    return this._raw.children
      .filter(c => c.name === name.toUpperCase())
      .map(wrapComponent);
  }
}

// ---------------------------------------------------------------------------
// VCALENDAR  (Section 3.4)
// ---------------------------------------------------------------------------
export class VCalendar extends Component {
  get prodid()    { return this.text('PRODID'); }
  get version()   { return this.text('VERSION'); }
  get calscale()  { return this.text('CALSCALE') || 'GREGORIAN'; }
  get method()    { return this.text('METHOD'); }
  get calname()   { return this.text('X-WR-CALNAME'); }
  get timezone()  { return this.text('X-WR-TIMEZONE'); }

  get events()    { return this.childrenOf('VEVENT').map(c => new VEvent(c._raw)); }
  get todos()     { return this.childrenOf('VTODO').map(c => new VTodo(c._raw)); }
  get journals()  { return this.childrenOf('VJOURNAL').map(c => new VJournal(c._raw)); }
  get freeBusy()  { return this.childrenOf('VFREEBUSY').map(c => new VFreeBusy(c._raw)); }
  get timezones() { return this.childrenOf('VTIMEZONE').map(c => new VTimezone(c._raw)); }
}

// ---------------------------------------------------------------------------
// Common properties mixin for calendar components
// ---------------------------------------------------------------------------
class CalendarComponent extends Component {
  get uid()           { return this.text('UID'); }
  get summary()       { return this.text('SUMMARY'); }
  get description()   { return this.text('DESCRIPTION'); }
  get comment()       { return this.props('COMMENT').map(p => p.asText()); }
  get location()      { return this.text('LOCATION'); }
  get geo()           { return this.prop('GEO')?.asGeo() ?? null; }
  get url()           { return this.prop('URL')?.asURI() ?? null; }
  get categories()    { return this.props('CATEGORIES').flatMap(p => p.value.split(',').map(parseText)); }
  get classification(){ return this.text('CLASS') || 'PUBLIC'; }
  get status()        { return this.text('STATUS'); }
  get sequence()      { return this.prop('SEQUENCE')?.asInteger() ?? 0; }
  get priority()      { return this.prop('PRIORITY')?.asInteger() ?? 0; }

  get dtstamp()       { return this.prop('DTSTAMP')?.asJSDate() ?? null; }
  get created()       { return this.prop('CREATED')?.asJSDate() ?? null; }
  get lastModified()  { return this.prop('LAST-MODIFIED')?.asJSDate() ?? null; }

  get organizer()     { return this.prop('ORGANIZER')?.asCalAddress() ?? null; }
  get attendees()     { return this.props('ATTENDEE').map(p => ({ address: p.asCalAddress(), params: p.params })); }
  get attach()        { return this.props('ATTACH').map(p => p.value); }

  get alarms()        { return this.childrenOf('VALARM').map(c => new VAlarm(c._raw)); }

  /** DTSTART as a JS Date, using the optional tzRegistry for offset resolution */
  dtstart(tzRegistry = null) {
    const p = this.prop('DTSTART');
    return p ? p.asJSDate(tzRegistry) : null;
  }

  /** raw DTSTART property (for isDate/isDateTime checks) */
  get dtstartProp() { return this.prop('DTSTART'); }
}

// ---------------------------------------------------------------------------
// VEVENT  (Section 3.6.1)
// ---------------------------------------------------------------------------
export class VEvent extends CalendarComponent {
  get transparency()    { return this.text('TRANSP') || 'OPAQUE'; }
  get recurrenceId()    { return this.prop('RECURRENCE-ID')?.asJSDate() ?? null; }
  get recurrenceIdProp(){ return this.prop('RECURRENCE-ID'); }

  dtend(tzRegistry = null) {
    const p = this.prop('DTEND');
    return p ? p.asJSDate(tzRegistry) : null;
  }

  /** Duration in ms (from DURATION property, or computed from DTEND - DTSTART) */
  duration(tzRegistry = null) {
    const dp = this.prop('DURATION');
    if (dp) return dp.asDuration();
    const s = this.dtstart(tzRegistry);
    const e = this.dtend(tzRegistry);
    if (s && e) return e.getTime() - s.getTime();
    return null;
  }

  get rrules()    { return this.props('RRULE').map(p => p.asRecur()); }
  get rdates()    { return this._parseDateList('RDATE'); }
  get exdates()   { return this._parseDateList('EXDATE'); }
  get exrules()   { return this.props('EXRULE').map(p => p.asRecur()); }

  _parseDateList(propName) {
    const dates = [];
    for (const p of this.props(propName)) {
      // RDATE/EXDATE may have multiple comma-separated values
      for (const v of p.value.split(',')) {
        const tzid = p.param('TZID');
        const dOrDT = parseDateOrDateTime(v.trim(), tzid ? { TZID: tzid } : {});
        dates.push({ prop: p, isDate: dOrDT.isDate, dateTime: dOrDT.dateTime, date: dOrDT.date, jsDate: dOrDT.jsDate });
      }
    }
    return dates;
  }

  get isRecurring() { return this.props('RRULE').length > 0 || this.props('RDATE').length > 0; }
}

// ---------------------------------------------------------------------------
// VTODO  (Section 3.6.2)
// ---------------------------------------------------------------------------
export class VTodo extends CalendarComponent {
  dtdue(tzRegistry = null) {
    const p = this.prop('DUE');
    return p ? p.asJSDate(tzRegistry) : null;
  }

  completed(tzRegistry = null) {
    const p = this.prop('COMPLETED');
    return p ? p.asJSDate(tzRegistry) : null;
  }

  get percentComplete() { return this.prop('PERCENT-COMPLETE')?.asInteger() ?? null; }

  get rrules()  { return this.props('RRULE').map(p => p.asRecur()); }
  get exdates() { return this._parseDateList('EXDATE'); }

  _parseDateList(propName) {
    const dates = [];
    for (const p of this.props(propName)) {
      for (const v of p.value.split(',')) {
        const tzid = p.param('TZID');
        const dOrDT = parseDateOrDateTime(v.trim(), tzid ? { TZID: tzid } : {});
        dates.push({ isDate: dOrDT.isDate, jsDate: dOrDT.jsDate });
      }
    }
    return dates;
  }
}

// ---------------------------------------------------------------------------
// VJOURNAL  (Section 3.6.3)
// ---------------------------------------------------------------------------
export class VJournal extends CalendarComponent {
  // VJOURNAL shares all CalendarComponent properties
}

// ---------------------------------------------------------------------------
// VFREEBUSY  (Section 3.6.4)
// ---------------------------------------------------------------------------
export class VFreeBusy extends Component {
  get uid()    { return this.text('UID'); }
  get organizer() { return this.prop('ORGANIZER')?.asCalAddress() ?? null; }
  get attendees() { return this.props('ATTENDEE').map(p => p.asCalAddress()); }

  dtstart(tzRegistry = null) {
    const p = this.prop('DTSTART');
    return p ? p.asJSDate(tzRegistry) : null;
  }

  dtend(tzRegistry = null) {
    const p = this.prop('DTEND');
    return p ? p.asJSDate(tzRegistry) : null;
  }

  get freeBusyPeriods() {
    return this.props('FREEBUSY').map(p => ({
      type: p.param('FBTYPE') || 'BUSY',
      periods: p.value.split(',').map(v => parsePeriod(v, p.params)),
    }));
  }
}

// ---------------------------------------------------------------------------
// VTIMEZONE  (Section 3.6.5)
// ---------------------------------------------------------------------------
export class VTimezone extends Component {
  get tzid()     { return this.text('TZID'); }
  get lastMod()  { return this.prop('LAST-MODIFIED')?.asJSDate() ?? null; }
  get tzurl()    { return this.prop('TZURL')?.asURI() ?? null; }

  get standard() { return this.childrenOf('STANDARD').map(c => new TZObservance(c._raw)); }
  get daylight() { return this.childrenOf('DAYLIGHT').map(c => new TZObservance(c._raw)); }

  /** All observances (STANDARD + DAYLIGHT) sorted by DTSTART */
  get observances() {
    return [...this.standard, ...this.daylight].sort((a, b) => {
      const ta = dateTimeToJSDate(a.dtstartRaw).getTime();
      const tb = dateTimeToJSDate(b.dtstartRaw).getTime();
      return ta - tb;
    });
  }
}

export class TZObservance extends Component {
  get kind()          { return this.name; } // 'STANDARD' or 'DAYLIGHT'
  get tzOffsetFrom()  { return this.prop('TZOFFSETFROM')?.asUTCOffset() ?? 0; }
  get tzOffsetTo()    { return this.prop('TZOFFSETTO')?.asUTCOffset() ?? 0; }
  get tzname()        { return this.text('TZNAME'); }
  get rrules()        { return this.props('RRULE').map(p => p.asRecur()); }
  get rdates()        { return this.props('RDATE').map(p => parseDateOrDateTime(p.value, p.params)); }

  get dtstartRaw() {
    const p = this.prop('DTSTART');
    if (!p) return null;
    return parseDateTime(p.value, null);
  }

  dtstart() {
    const dt = this.dtstartRaw;
    if (!dt) return null;
    return dateTimeToJSDate(dt);
  }
}

// ---------------------------------------------------------------------------
// VALARM  (Section 3.6.6)
// ---------------------------------------------------------------------------
export class VAlarm extends Component {
  get action()      { return this.text('ACTION'); }
  get description() { return this.text('DESCRIPTION'); }
  get summary()     { return this.text('SUMMARY'); }
  get repeat()      { return this.prop('REPEAT')?.asInteger() ?? 0; }
  get duration()    { return this.prop('DURATION')?.asDuration() ?? null; }
  get attach()      { return this.prop('ATTACH')?.value ?? null; }

  get trigger() {
    const p = this.prop('TRIGGER');
    if (!p) return null;
    const related = p.param('RELATED') || 'START';
    const value   = p.param('VALUE')   || '';
    if (value.toUpperCase() === 'DATE-TIME') {
      return { absolute: true, dateTime: parseDateTime(p.value), related };
    }
    return { absolute: false, offset: parseDuration(p.value), related };
  }
}

// ---------------------------------------------------------------------------
// Factory: wrap a raw component in the appropriate class
// ---------------------------------------------------------------------------
export function wrapComponent(raw) {
  switch (raw.name) {
    case 'VCALENDAR':  return new VCalendar(raw);
    case 'VEVENT':     return new VEvent(raw);
    case 'VTODO':      return new VTodo(raw);
    case 'VJOURNAL':   return new VJournal(raw);
    case 'VFREEBUSY':  return new VFreeBusy(raw);
    case 'VTIMEZONE':  return new VTimezone(raw);
    case 'STANDARD':
    case 'DAYLIGHT':   return new TZObservance(raw);
    case 'VALARM':     return new VAlarm(raw);
    default:           return new Component(raw);
  }
}
