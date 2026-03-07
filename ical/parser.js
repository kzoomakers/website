/**
 * RFC 5545 Section 3.1 - iCalendar Parser
 *
 * Produces a tree of Component objects from raw ICS text.
 * Does NOT depend on model.js so it can be used standalone.
 */

// Properties that may appear multiple times in a component (must be accumulated)
const MULTI_VALUED = new Set([
  'EXDATE', 'RDATE', 'EXRULE', 'RRULE',
  'ATTENDEE', 'COMMENT', 'CONTACT', 'CATEGORIES',
  'ATTACH', 'FREEBUSY', 'X-CUSTOM',
]);

/**
 * Raw parser result types (plain objects, no model.js dependency):
 *
 * Property: { name: string, params: Object<string, string[]>, value: string }
 * Component: { name: string, properties: Object<string, Property[]>, children: Component[] }
 */

// ---------------------------------------------------------------------------
// Step 1: Line unfolding  (RFC 5545 §3.1)
// A logical line may span multiple physical lines; continuation lines start
// with a single SPACE (0x20) or HTAB (0x09) character.
// ---------------------------------------------------------------------------
export function unfoldLines(text) {
  // Normalize CRLF, CR-only, LF-only to plain \n
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Remove fold: newline followed by a single SPACE or TAB
    .replace(/\n[ \t]/g, '');
}

// ---------------------------------------------------------------------------
// Step 2: Content-line tokeniser  (RFC 5545 §3.1)
// Each unfolded line has the form:
//   name *(";" param) ":" value
// where param = param-name "=" param-value *("," param-value)
// param-value may be quoted (DQUOTE *SAFE-CHAR DQUOTE) or unquoted
// ---------------------------------------------------------------------------

/**
 * Parse a single content line into { name, params, value }.
 * params is a plain Object: param-name (uppercase) -> string[] of values
 */
export function parseContentLine(line) {
  if (!line || line.trim() === '') return null;

  // Find the first unquoted colon - that separates name+params from value
  let inQuote = false;
  let colonIdx = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuote = !inQuote; continue; }
    if (!inQuote && c === ':') { colonIdx = i; break; }
  }

  if (colonIdx === -1) return null;

  const nameAndParams = line.slice(0, colonIdx);
  const value         = line.slice(colonIdx + 1);

  // Split nameAndParams by unquoted semicolons
  const segments = splitUnquoted(nameAndParams, ';');
  const name     = segments[0].toUpperCase();
  const params   = {};

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    const eq  = seg.indexOf('=');
    if (eq === -1) continue;
    const pName = seg.slice(0, eq).toUpperCase();
    const pRaw  = seg.slice(eq + 1);

    // param-value list: comma-separated, may be quoted
    const pValues = splitUnquoted(pRaw, ',').map(v =>
      v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v
    );

    if (params[pName]) {
      params[pName].push(...pValues);
    } else {
      params[pName] = pValues;
    }
  }

  return { name, params, value };
}

/** Split a string on a delimiter, respecting double-quoted sections */
function splitUnquoted(str, delim) {
  const parts = [];
  let current = '';
  let inQuote  = false;

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '"') { inQuote = !inQuote; current += c; continue; }
    if (!inQuote && c === delim) {
      parts.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  parts.push(current);
  return parts;
}

// ---------------------------------------------------------------------------
// Step 3: Component tree builder
// ---------------------------------------------------------------------------

/**
 * Parse an ICS text string into a Component tree.
 *
 * Returns the outermost component (typically VCALENDAR).
 * If the text contains multiple top-level components, returns an array.
 */
export function parseICS(text) {
  const unfolded = unfoldLines(text);
  const lines    = unfolded.split('\n').filter(l => l.trim() !== '');

  const stack  = [];   // Component stack
  const roots  = [];   // Top-level components

  for (const line of lines) {
    const cl = parseContentLine(line);
    if (!cl) continue;

    if (cl.name === 'BEGIN') {
      const comp = {
        name:       cl.value.toUpperCase(),
        properties: {},
        children:   [],
      };
      if (stack.length > 0) {
        stack[stack.length - 1].children.push(comp);
      } else {
        roots.push(comp);
      }
      stack.push(comp);
      continue;
    }

    if (cl.name === 'END') {
      if (stack.length === 0) continue;
      const ended = stack.pop();
      if (ended.name !== cl.value.toUpperCase()) {
        // Mismatched END — be lenient, just pop
      }
      continue;
    }

    if (stack.length === 0) continue; // property outside any component

    const current = stack[stack.length - 1];
    addProperty(current, cl);
  }

  if (roots.length === 1) return roots[0];
  return roots;
}

/**
 * Add a parsed content-line as a Property to a component.
 * Multi-valued property names accumulate into arrays;
 * single-valued ones are overwritten (last-write wins per RFC when not multi).
 */
function addProperty(component, cl) {
  // Normalise: consolidate first param value for common single-value params
  const prop = {
    name:   cl.name,
    params: cl.params,
    value:  cl.value,
  };

  const existing = component.properties[cl.name];
  const isMulti  = MULTI_VALUED.has(cl.name) || cl.name.startsWith('X-');

  if (isMulti) {
    if (existing) {
      existing.push(prop);
    } else {
      component.properties[cl.name] = [prop];
    }
  } else {
    // Store as single-element array for uniform access
    component.properties[cl.name] = [prop];
  }
}

// ---------------------------------------------------------------------------
// Convenience accessors on raw component objects
// ---------------------------------------------------------------------------

/** Get the first (or only) property with the given name, or null */
export function getProp(component, name) {
  const arr = component.properties[name.toUpperCase()];
  return arr ? arr[0] : null;
}

/** Get all properties with the given name */
export function getProps(component, name) {
  return component.properties[name.toUpperCase()] || [];
}

/** Get the raw value of the first property with the given name, or null */
export function getValue(component, name) {
  const p = getProp(component, name);
  return p ? p.value : null;
}

/** Get a parameter value (first value in the list) from a property */
export function getParam(prop, paramName) {
  if (!prop || !prop.params) return null;
  const vals = prop.params[paramName.toUpperCase()];
  return vals && vals.length ? vals[0] : null;
}
