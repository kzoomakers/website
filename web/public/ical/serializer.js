/**
 * RFC 5545 §3.1 - iCalendar Serializer
 *
 * Converts a component tree (raw objects from parser.js) back to ICS text.
 *
 * Conforms to:
 *  - Line folding at 75 octets (§3.1)
 *  - CRLF line endings (§3.1)
 *  - TEXT value escaping (§3.3.11)
 *  - Parameter value quoting when needed (§3.2)
 */

import { escapeText } from './values.js';

// Properties whose values are TEXT type and must be escaped
const TEXT_PROPS = new Set([
  'SUMMARY', 'DESCRIPTION', 'LOCATION', 'COMMENT', 'CONTACT',
  'CATEGORIES', 'TZNAME', 'STATUS', 'RELTYPE', 'NOTE', 'PRODID',
]);

// Properties that must NOT have their values escaped (dates, binary, etc.)
const RAW_PROPS = new Set([
  'DTSTART', 'DTEND', 'DTSTAMP', 'DUE', 'COMPLETED', 'CREATED',
  'LAST-MODIFIED', 'RECURRENCE-ID', 'EXDATE', 'RDATE',
  'RRULE', 'EXRULE', 'DURATION', 'TRIGGER', 'GEO', 'SEQUENCE',
  'PRIORITY', 'PERCENT-COMPLETE', 'REPEAT', 'FREEBUSY',
  'TZOFFSETFROM', 'TZOFFSETTO', 'VERSION', 'CALSCALE', 'METHOD',
]);

// Parameter values that require quoting if they contain these characters
const PARAM_NEEDS_QUOTE_RE = /[,:;]/;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Serialize a raw component object (as returned by parser.parseICS)
 * to an ICS string with proper CRLF line endings and 75-octet folding.
 *
 * @param {object} component   - { name, properties, children }
 * @returns {string}
 */
export function serialize(component) {
  const lines = serializeComponent(component);
  return lines.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// Component serialization
// ---------------------------------------------------------------------------

function serializeComponent(comp) {
  const lines = [];

  lines.push(`BEGIN:${comp.name}`);

  // Properties
  for (const [propName, propArr] of Object.entries(comp.properties)) {
    for (const prop of propArr) {
      const line = serializeProperty(prop);
      lines.push(...foldLine(line));
    }
  }

  // Children (sub-components)
  for (const child of comp.children) {
    lines.push(...serializeComponent(child));
  }

  lines.push(`END:${comp.name}`);
  return lines;
}

// ---------------------------------------------------------------------------
// Property serialization
// ---------------------------------------------------------------------------

function serializeProperty(prop) {
  let line = prop.name;

  // Parameters
  if (prop.params) {
    for (const [pName, pValues] of Object.entries(prop.params)) {
      if (!pValues || pValues.length === 0) continue;
      const serialized = pValues.map(v =>
        PARAM_NEEDS_QUOTE_RE.test(v) ? `"${v}"` : v
      ).join(',');
      line += `;${pName}=${serialized}`;
    }
  }

  line += ':';

  // Value
  const value = serializeValue(prop);
  line += value;

  return line;
}

function serializeValue(prop) {
  const name = prop.name;
  const val  = prop.value;

  // TEXT properties: escape special characters
  if (TEXT_PROPS.has(name)) {
    return escapeText(val);
  }

  // URI / CAL-ADDRESS values that already have the right format
  if (RAW_PROPS.has(name)) {
    return val; // pass through unchanged
  }

  // X- properties: preserve as-is
  if (name.startsWith('X-') || name.startsWith('IANA-')) {
    return val;
  }

  // Default: pass through (handles most cases correctly)
  return val;
}

// ---------------------------------------------------------------------------
// Line folding  (RFC 5545 §3.1)
// Fold at 75 octets (bytes, not characters).
// Continuation lines begin with a single SPACE character.
// ---------------------------------------------------------------------------

/**
 * Fold a single content line into multiple physical lines of <= 75 octets each.
 * Returns an array of strings (without CRLF endings — the join adds those).
 */
export function foldLine(line) {
  const encoder = new TextEncoder();
  const bytes   = encoder.encode(line);

  if (bytes.length <= 75) return [line];

  const result = [];
  let offset   = 0;

  // First line: up to 75 bytes
  let chunkBytes = sliceToByteLength(line, offset, 75);
  result.push(chunkBytes.str);
  offset += chunkBytes.byteLen;

  // Continuation lines: up to 74 bytes (one byte used for the leading SPACE)
  while (offset < bytes.length) {
    chunkBytes = sliceToByteLength(line, offset, 74);
    result.push(' ' + chunkBytes.str);
    offset += chunkBytes.byteLen;
  }

  return result;
}

/**
 * Slice a string starting at character-offset `charStart` such that the
 * resulting substring is at most `maxBytes` UTF-8 bytes long.
 * Returns { str, byteLen }.
 *
 * We walk character by character to avoid splitting a multi-byte codepoint.
 */
function sliceToByteLength(str, charStart, maxBytes) {
  const encoder = new TextEncoder();
  let byteCount = 0;
  let i = charStart;

  while (i < str.length) {
    const ch       = str[i];
    const charCode = str.codePointAt(i);
    // Surrogate pairs count as one Unicode character but two JS chars
    const jsCharLen = charCode > 0xFFFF ? 2 : 1;
    const charBytes = encoder.encode(str.slice(i, i + jsCharLen)).length;

    if (byteCount + charBytes > maxBytes) break;

    byteCount += charBytes;
    i += jsCharLen;
  }

  return { str: str.slice(charStart, i), byteLen: i - charStart };
}

// ---------------------------------------------------------------------------
// Helpers for building ICS content from scratch
// ---------------------------------------------------------------------------

/**
 * Build a minimal VCALENDAR wrapper around a set of VEVENT-like raw objects.
 */
export function buildCalendar(components, {
  prodid   = '-//ical.js//RFC5545//EN',
  version  = '2.0',
  calscale = 'GREGORIAN',
  method   = null,
} = {}) {
  const props = {
    PRODID:  [{ name: 'PRODID',  params: {}, value: prodid   }],
    VERSION: [{ name: 'VERSION', params: {}, value: version  }],
    CALSCALE:[{ name: 'CALSCALE',params: {}, value: calscale }],
  };
  if (method) {
    props.METHOD = [{ name: 'METHOD', params: {}, value: method }];
  }

  return {
    name:       'VCALENDAR',
    properties: props,
    children:   components,
  };
}
