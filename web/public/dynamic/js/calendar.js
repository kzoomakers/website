let allEvents = [];
let currentView = 'list'; // 'list' or 'iframe'

// The .ics reader (parseICS, cleanICSText) is the standalone kzoo-calendar library, loaded as a module; loadCalendar waits for it.
let parseICS, cleanICSText;
const libReady = import('/vendor/kzoo-calendar/index.js').then((m) => { ({ parseICS, cleanICSText } = m); });

// Format date for display
function formatDate(date) {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

// Format time for display
function formatTime(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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
    // Same-origin proxy of the feed set in Admin > Webmaster > Calendar (cached server-side)
    const response = await fetch('/api/webmaster/calendar');

    if (!response.ok) {
      throw new Error('Failed to fetch calendar');
    }

    const icsContent = await response.text();
    await libReady;
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

  console.log(`convertEventsForCalendarView: Processing ${events.length} events`);
  
  const converted = events.map((event, index) => {
    // Assign colors in a round-robin fashion
    const color = colors[colorIndex % colors.length];
    colorIndex++;
    
    const momentDate = moment(event.start);
    console.log(`  Event ${index}: ${event.title}`);
    console.log(`    - Raw start: ${event.start}`);
    console.log(`    - Moment date: ${momentDate.format('YYYY-MM-DD HH:mm:ss')}`);
    console.log(`    - Moment ISO: ${momentDate.toISOString()}`);
    
    return {
      eventName: event.title,
      calendar: 'Kzoo Makers',
      color: color,
      date: momentDate, // Use the actual parsed start date
      originalEvent: event
    };
  });
  
  console.log(`Converted ${converted.length} events for calendar view`);
  return converted;
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
    
    // Initialize calendar grid view if the grid element exists
    if (document.querySelector('#grid') && window.initializeCalendarWithICSEvents) {
      // Use all events (not just filtered) for the calendar grid
      console.log(`Initializing calendar grid with ${allEvents.length} total events`);
      window.initializeCalendarWithICSEvents(allEvents);
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
