let allEvents = [];
let currentView = 'list'; // 'list' or 'iframe'

// Parse ICS date format
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
function generateRecurringInstances(event, rrule, startDate, endDate, exceptionDates = []) {
  const instances = [];
  const rules = parseRRule(rrule);

  const freq = rules.FREQ;
  const until = rules.UNTIL ? parseICSDate(rules.UNTIL) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const count = rules.COUNT ? parseInt(rules.COUNT) : null;
  const interval = rules.INTERVAL ? parseInt(rules.INTERVAL) : 1;
  const byday = parseBYDAY(rules.BYDAY);
  const bymonthday = rules.BYMONTHDAY;
  const bymonth = rules.BYMONTH;
  const byyearday = rules.BYYEARDAY;

  let currentDate = new Date(startDate);
  let instanceCount = 0;

  // Use start of today for comparison
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // For WEEKLY with BYDAY, we need to generate instances for each specified day
  const maxIterations = 10000; // Safety limit
  let iterations = 0;

  while (currentDate <= until && currentDate <= new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) && iterations < maxIterations) {
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
function parseICS(icsContent) {
  const events = [];
  const lines = icsContent.split(/\r?\n/);
  let currentEvent = null;
  let currentField = '';
  const now = new Date();
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

      if (startDate) {
        // For non-recurring events, skip past events
        if (!currentEvent.RRULE && startDate < now) {
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
          isAllDay: isAllDay
        };

        // Handle recurring events (but not RECURRENCE-ID exceptions which are single instances)
        if (currentEvent.RRULE && !currentEvent['RECURRENCE-ID']) {
          // Parse exception dates if present
          const exceptionDates = currentEvent.EXDATE ? parseEXDATE(currentEvent.EXDATE) : [];
          const instances = generateRecurringInstances(event, currentEvent.RRULE, startDate, endDate, exceptionDates);
          events.push(...instances);
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

  return events;
}

// Format date for display
function formatDate(date) {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

// Format time for display
function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

// Clean ICS text values (unescape and unfold)
function cleanICSText(text) {
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

// Clean HTML from description
function cleanDescription(desc) {
  if (!desc) return '';

  // First clean ICS escapes
  desc = cleanICSText(desc);

  // Convert <br> tags to newlines
  desc = desc.replace(/<br\s*\/?>/gi, '\n');

  // Preserve links but clean other HTML
  desc = desc.replace(/<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, '<a href="$1" target="_blank">$2</a>');

  // Remove other HTML tags
  desc = desc.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  const textarea = document.createElement('textarea');
  textarea.innerHTML = desc;
  desc = textarea.value;

  // Convert URLs to links if not already linked
  desc = desc.replace(/(?<!href=")(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');

  return desc;
}

// Group events by month
function groupEventsByMonth(events) {
  const grouped = {};

  events.forEach(event => {
    const monthKey = `${event.start.getFullYear()}-${String(event.start.getMonth() + 1).padStart(2, '0')}`;
    const monthName = event.start.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });

    if (!grouped[monthKey]) {
      grouped[monthKey] = {
        name: monthName,
        events: []
      };
    }

    grouped[monthKey].events.push(event);
  });

  return grouped;
}

// Store events data for button access
const eventDataMap = new Map();

// Display events
function displayEvents(events) {
  const container = document.getElementById('events-list-container');
  
  if (!container) {
    console.warn('Events list container not found');
    return;
  }

  if (events.length === 0) {
    container.innerHTML = '<div class="no-events-message">No events found for the selected date range.</div>';
    return;
  }

  // Clear previous event data
  eventDataMap.clear();

  // Sort events by date
  events.sort((a, b) => a.start - b.start);

  // Group by month
  const groupedEvents = groupEventsByMonth(events);

  let html = '<div class="events-container">';

  Object.keys(groupedEvents).sort().forEach(monthKey => {
    const month = groupedEvents[monthKey];

    html += `<div class="month-section">`;
    html += `<div class="month-header">${month.name}</div>`;

    month.events.forEach((event, index) => {
      const dateStr = formatDate(event.start);
      const timeStr = event.isAllDay ? 'All Day' : `${formatTime(event.start)} - ${formatTime(event.end)}`;
      const description = cleanDescription(event.description);
      const location = cleanICSText(event.location);

      // Create a unique ID for the event based on title and date
      const eventId = `event-${event.start.getTime()}-${index}`;

      // Store event data for button access
      eventDataMap.set(eventId, {
        title: event.title,
        start: event.start,
        end: event.end,
        description: event.description,
        location: event.location,
        isAllDay: event.isAllDay
      });

      html += `
        <div class="event-card" id="${eventId}">
          <div class="event-date">
            <span class="event-date-text">${dateStr}</span>
            <button class="share-button" onclick="addToCalendar('${eventId}')" title="Add to your calendar">
              📅 Add
            </button>
            <button class="share-button" onclick="copyEventLink('${eventId}')" title="Copy link to clipboard">
              📋 Copy
            </button>
            <button class="share-button" onclick="shareEvent('${eventId}')" title="Share this event">
              🔗 Share
            </button>
          </div>
          <div class="event-time">${timeStr}</div>
          <div class="event-title">${event.title}</div>
          ${location ? `<div class="event-location">📍 ${location}</div>` : ''}
          ${description ? `<div class="event-description">${description}</div>` : ''}
        </div>
      `;
    });

    html += `</div>`;
  });

  html += '</div>';
  container.innerHTML = html;
}

// Filter events by date range
function filterEvents(startDate, endDate) {
  return allEvents.filter(event => {
    return event.start >= startDate && event.start <= endDate;
  });
}

// Filter: This Month
function filterThisMonth() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const filtered = filterEvents(start, end);
  displayEvents(filtered);
}

// Filter: Next Month
function filterNextMonth() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);

  const filtered = filterEvents(start, end);
  displayEvents(filtered);
}

// Filter: Custom Range
function filterCustomRange() {
  const startInput = document.getElementById('start-date').value;
  const endInput = document.getElementById('end-date').value;

  if (!startInput || !endInput) {
    alert('Please select both start and end dates');
    return;
  }

  const start = new Date(startInput);
  const end = new Date(endInput);
  end.setHours(23, 59, 59);

  if (start > end) {
    alert('Start date must be before end date');
    return;
  }

  const filtered = filterEvents(start, end);
  displayEvents(filtered);
}

// Clear filter and show all upcoming events
function clearFilter() {
  const now = new Date(); // Current moment
  const upcoming = allEvents.filter(event => event.start > now);
  displayEvents(upcoming);
}

// Toggle between list and iframe view
function toggleCalendarView() {
  const listContainer = document.getElementById('events-list-container');
  const iframeContainer = document.getElementById('calendar-iframe-container');
  const toggleBtn = document.getElementById('toggle-view-btn');
  const filterControls = document.getElementById('filter-controls');

  if (currentView === 'list') {
    listContainer.style.display = 'none';
    iframeContainer.style.display = 'block';
    filterControls.style.display = 'none';
    toggleBtn.textContent = 'Switch to List View';
    currentView = 'iframe';
  } else {
    listContainer.style.display = 'block';
    iframeContainer.style.display = 'none';
    filterControls.style.display = 'block';
    toggleBtn.textContent = 'Switch to Calendar View';
    currentView = 'list';
  }
}

// Fetch and parse calendar
async function loadCalendar() {
  const container = document.getElementById('events-list-container');

  try {
    // Use a CORS proxy to fetch the ICS file
    const response = await fetch('https://kzoomakers.org/cal.ics');

    if (!response.ok) {
      throw new Error('Failed to fetch calendar');
    }

    const icsContent = await response.text();
    allEvents = parseICS(icsContent);

    // Filter to show upcoming events only (excluding past and currently happening events)
    const now = new Date(); // Current moment, not start of day

    const endDate = new Date(now.getFullYear(), now.getMonth() + 6, 0, 23, 59, 59, 999);
    // This creates a date at the last day of the month that is 5 months from now
    // (month + 6 with day 0 = last day of month + 5)

    // Filter out past events and events beyond our date range
    const filtered = allEvents.filter(event => {
      const eventDate = new Date(event.start);
      return eventDate > now && eventDate <= endDate;
    });

    console.log(`Showing ${filtered.length} events from ${now.toLocaleDateString()} to ${endDate.toLocaleDateString()}`);

    displayEvents(filtered);

  } catch (error) {
    console.error('Error loading calendar:', error);
    if (container) {
      container.innerHTML = `
        <div class="error-message">
          <strong>Unable to load calendar events right now.</strong><br>
          Please try refreshing the page or switch to Calendar View to see events.
        </div>
      `;
    }
  }
}

// Show notification toast
function showNotification(message) {
  // Remove any existing notification
  const existing = document.querySelector('.copy-notification');
  if (existing) {
    existing.remove();
  }

  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'copy-notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  // Trigger fade in
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  // Fade out and remove after 3 seconds
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

// Format date for ICS file
function formatICSDate(date, isAllDay = false) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  if (isAllDay) {
    return `${year}${month}${day}`;
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

// Add to calendar function - generates ICS file
function addToCalendar(eventId) {
  const event = eventDataMap.get(eventId);
  if (!event) return;

  const startDate = formatICSDate(event.start, event.isAllDay);
  const endDate = formatICSDate(event.end, event.isAllDay);
  const now = formatICSDate(new Date());

  // Escape special characters for ICS format
  const escapeICS = (str) => {
    return str.replace(/\\/g, '\\\\')
              .replace(/;/g, '\\;')
              .replace(/,/g, '\\,')
              .replace(/\n/g, '\\n');
  };

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kzoo Makers//Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${eventId}@kzoomakers.org`,
    `DTSTAMP:${now}`,
    `DTSTART:${startDate}`,
    `DTEND:${endDate}`,
    `SUMMARY:${escapeICS(event.title)}`,
    event.location ? `LOCATION:${escapeICS(event.location)}` : '',
    event.description ? `DESCRIPTION:${escapeICS(event.description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(line => line).join('\r\n');

  // Create blob and download
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${event.title.replace(/[^a-z0-9]/gi, '_')}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);

  showNotification('📅 Calendar file downloaded!');
}

// Copy event link directly to clipboard
function copyEventLink(eventId) {
  const url = `${window.location.origin}${window.location.pathname}#${eventId}`;
  copyToClipboard(url);
}

// Share event function with event details
function shareEvent(eventId) {
  const event = eventDataMap.get(eventId);
  const url = `${window.location.origin}${window.location.pathname}#${eventId}`;

  if (!event) {
    copyToClipboard(url);
    return;
  }

  // Format the date nicely
  const dateStr = formatDate(event.start);
  const shareText = `Check out the Kzoo Makers meeting "${event.title}" on ${dateStr} at ${url}`;

  // Try to use the Web Share API if available (mobile devices)
  if (navigator.share) {
    navigator.share({
      title: `Kzoo Makers: ${event.title}`,
      text: shareText,
      url: url
    }).catch(err => {
      // If share fails or is cancelled, fall back to copying to clipboard
      if (err.name !== 'AbortError') {
        copyToClipboard(url);
      }
    });
  } else {
    // Fall back to copying to clipboard (desktop)
    copyToClipboard(url);
  }
}

// Copy URL to clipboard
function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showNotification('🔗 Link copied to clipboard!');
    }).catch(err => {
      // Fallback for older browsers
      fallbackCopyToClipboard(text);
    });
  } else {
    fallbackCopyToClipboard(text);
  }
}

// Fallback copy method for older browsers
function fallbackCopyToClipboard(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    document.execCommand('copy');
    showNotification('🔗 Link copied to clipboard!');
  } catch (err) {
    showNotification('❌ Unable to copy link');
  }

  document.body.removeChild(textArea);
}

// Scroll to event if hash is present in URL
function scrollToEventIfNeeded() {
  if (window.location.hash) {
    const eventId = window.location.hash.substring(1);
    const element = document.getElementById(eventId);

    if (element) {
      setTimeout(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.style.backgroundColor = '#fff3cd';
        setTimeout(() => {
          element.style.transition = 'background-color 1s ease';
          element.style.backgroundColor = 'white';
        }, 1000);
      }, 500);
    }
  }
}

// Show purge notification
function showPurgeNotification(message, isError = false) {
  // Remove any existing notification
  const existing = document.querySelector('.purge-notification');
  if (existing) {
    existing.remove();
  }

  // Create notification element
  const notification = document.createElement('div');
  notification.className = 'purge-notification';
  if (isError) {
    notification.classList.add('error');
  }
  notification.textContent = message;
  document.body.appendChild(notification);

  // Trigger fade in
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  // Fade out and remove after 5 seconds
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 5000);
}

// Convert parsed events to calendar view format
function convertEventsForCalendarView(events) {
  const colors = ['blue', 'orange', 'green', 'yellow'];
  let colorIndex = 0;

  return events.map((event, index) => {
    // Assign colors in a round-robin fashion
    const color = colors[colorIndex % colors.length];
    colorIndex++;
    
    return {
      eventName: event.title,
      calendar: 'Kzoo Makers',
      color: color,
      date: moment(event.start), // Use the actual parsed start date
      originalEvent: event
    };
  });
}

// Toggle between list, grid, and Google calendar views
function toggleListView() {
  const listContainer = document.getElementById('list-view-container');
  const gridContainer = document.getElementById('grid-view-container');
  const googleContainer = document.getElementById('google-view-container');
  const listBtn = document.getElementById('toggle-list-view-btn');
  const gridBtn = document.getElementById('toggle-grid-view-btn');
  const googleBtn = document.getElementById('toggle-google-view-btn');
  
  if (listContainer) listContainer.style.display = 'block';
  if (gridContainer) gridContainer.style.display = 'none';
  if (googleContainer) googleContainer.style.display = 'none';
  
  if (listBtn) listBtn.style.backgroundColor = '#47424C';
  if (gridBtn) gridBtn.style.backgroundColor = '#5cb85c';
  if (googleBtn) googleBtn.style.backgroundColor = '#5cb85c';
}

function toggleGridView() {
  const listContainer = document.getElementById('list-view-container');
  const gridContainer = document.getElementById('grid-view-container');
  const googleContainer = document.getElementById('google-view-container');
  const listBtn = document.getElementById('toggle-list-view-btn');
  const gridBtn = document.getElementById('toggle-grid-view-btn');
  const googleBtn = document.getElementById('toggle-google-view-btn');
  
  if (listContainer) listContainer.style.display = 'none';
  if (gridContainer) gridContainer.style.display = 'block';
  if (googleContainer) googleContainer.style.display = 'none';
  
  if (listBtn) listBtn.style.backgroundColor = '#5cb85c';
  if (gridBtn) gridBtn.style.backgroundColor = '#47424C';
  if (googleBtn) googleBtn.style.backgroundColor = '#5cb85c';
}

// Load calendar when page loads
document.addEventListener('DOMContentLoaded', () => {
  loadCalendar().then(() => {
    scrollToEventIfNeeded();
    
    // Initialize calendar grid view if the calendar element exists
    if (document.querySelector('#calendar')) {
      // Use all events (not just filtered) for the calendar grid
      console.log(`Initializing calendar grid with ${allEvents.length} total events`);
      const calendarViewEvents = convertEventsForCalendarView(allEvents);
      console.log(`Converted to ${calendarViewEvents.length} calendar view events`);
      window.calendarView = new CalendarView('#calendar', calendarViewEvents);
    }
    
    // Display list view by default
    if (document.getElementById('toggle-list-view-btn')) {
      toggleListView();
    }
  });

  // Purge button functionality
  const purgeButton = document.getElementById('purge-button');
  if (!purgeButton) {
    return; // Purge button not on this page
  }
  
  let isClicked = false;

  // Show hover image on mouseover
  purgeButton.addEventListener('mouseenter', () => {
    if (!isClicked) {
      purgeButton.classList.add('show-hover-image');
    }
  });

  // Hide hover image on mouseout
  purgeButton.addEventListener('mouseleave', () => {
    if (!isClicked) {
      purgeButton.classList.remove('show-hover-image');
    }
  });

  // Make request and show response on click
  purgeButton.addEventListener('click', async () => {
    isClicked = true;

    // Remove hover class and add click class
    purgeButton.classList.remove('show-hover-image');
    purgeButton.classList.add('show-click-image');

    // Wait 1 second to show the click image
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Remove click image
    purgeButton.classList.remove('show-click-image');
    isClicked = false;

    // Make the request
    try {
      const response = await fetch('/purge/cal.ics');

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const content = await response.text();
      showPurgeNotification(content);
    } catch (error) {
      showPurgeNotification(`Failed to issue request: ${error.message}`, true);
    }
  });
});
