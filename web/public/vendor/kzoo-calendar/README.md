# kzoo-calendar

Dependency-free `.ics` reader for browsers and Node (ESM, no DOM).

```js
import { parseICS, eventsOn, timeLabel } from "kzoo-calendar";
const events = parseICS(icsText);          // recurring events expanded one year ahead
eventsOn(events).forEach((e) => console.log(e.title, e.isAllDay ? "all day" : timeLabel(e.start)));
```

- `parseICS(text, from = new Date())` → `{ title, start, end, description, location, isAllDay }[]`; drops events that ended before `from`'s day.
- `eventsOn(events, day = new Date())` → events on that local day, earliest first (includes multi-day spans).
- Handles RRULE (FREQ, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH, BYYEARDAY) and EXDATE. Not BYSETPOS/BYWEEKNO.
- Vendored in this repo at `web/public/vendor/kzoo-calendar`; it imports nothing, so copy the folder anywhere. Test: `npm test` (`tests/kzoo-calendar.test.mjs`).
