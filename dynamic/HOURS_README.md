# Dynamic Hours of Operation System

## Overview
The KzooMakers website now uses a dynamic hours system that loads hours of operation from a centralized JSON file and displays them consistently across multiple pages.

## Files

### 1. `dynamic/json/hours.json`
This is the **single source of truth** for all hours information. Update this file to change hours across the entire website.

**Structure:**
```json
{
  "schedule": {
    "openDays": ["Monday", "Tuesday", "Thursday", "Saturday"],
    "openDaysShort": ["Mon", "Tue", "Thu", "Sat"],
    "closedDays": ["Wednesday", "Friday", "Sunday"],
    "closedDaysShort": ["Wed", "Fri", "Sun"],
    "closedMessage": "Scheduled Events Only",
    "openTime": "10:00 AM",
    "closeTime": "12:00 AM",
    "closeTimeDisplay": "12:00 AM (Midnight)"
  },
  "display": {
    "title": "Hours of Operation",
    "subtitle": "We're Open!",
    "timezone": "EST"
  },
  "contact": {
    "address": "1102 E. Michigan Ave, Kalamazoo, MI 49048",
    "phone": "(269) 270-3141",
    "email": "contact@kzoomakers.org"
  }
}
```

### 2. `dynamic/js/hours.js`
JavaScript module that loads the JSON data and renders it in different formats for different page contexts.

## Where Hours Are Displayed

### 1. **Contact Page** (`contact.html`)
- Location: Inside the "Our Address" card
- Element ID: `hours-contact-card`
- Format: Compact text display

### 2. **Homepage** (`index.html`)
- Location: Dedicated "Hours of Operation" section
- Element ID: `hours-homepage-section`
- Format: Full card with icon, detailed hours, and address

### 3. **Footer** (All pages via `footer.json`)
- Location: Footer column
- Element ID: `hours-footer-section`
- Format: List with links to contact page

## How to Update Hours

### Simple Update (Change hours only)
Edit `dynamic/json/hours.json` and modify the schedule section:

```json
"schedule": {
  "openDays": ["Monday", "Tuesday", "Wednesday"],
  "openDaysShort": ["Mon", "Tue", "Wed"],
  "closedDays": ["Thursday", "Friday", "Saturday", "Sunday"],
  "closedDaysShort": ["Thu", "Fri", "Sat", "Sun"],
  "closedMessage": "Closed",
  "openTime": "9:00 AM",
  "closeTime": "5:00 PM",
  "closeTimeDisplay": "5:00 PM"
}
```

**Note:** The `closedMessage` field allows you to customize what displays for closed days (e.g., "Closed", "Scheduled Events Only", "By Appointment Only").

The changes will automatically appear on all pages that include the hours.js script.

### Adding Hours to a New Page

1. Add the hours script before the closing `</body>` tag:
```html
<!-- Dynamic Hours -->
<script src="dynamic/js/hours.js"></script>
```

2. Add one of these placeholder elements where you want hours to appear:

**For Contact Card Style:**
```html
<div id="hours-contact-card">
  <!-- Hours will be dynamically loaded -->
  <p>Loading hours...</p>
</div>
```

**For Homepage Section Style:**
```html
<div id="hours-homepage-section">
  <!-- Hours will be dynamically loaded -->
  <p>Loading hours...</p>
</div>
```

**For Footer Style:**
```html
<div id="hours-footer-section">
  <!-- Hours will be dynamically loaded -->
  <p>Loading hours...</p>
</div>
```

## JavaScript API

The hours system exposes a global API for manual control:

```javascript
// Refresh hours display (useful after updating JSON)
window.KzooHours.refresh();

// Get current hours data
const hoursData = window.KzooHours.getData();
console.log(hoursData);
```

## Pages Currently Using Dynamic Hours

- ✅ `index.html` - Homepage section
- ✅ `contact.html` - Contact card
- ✅ `about.html` - Footer only
- ✅ All pages with footer - Footer column

## Styling

The hours display uses inline styles and Bootstrap classes to match the existing website design:
- **Open hours accent color:** `#f9b234` (yellow/gold)
- **Closed days color:** `#dc3545` (red) - Makes closed days stand out clearly
- Closed days are displayed in bold red text to ensure visibility

## Troubleshooting

**Hours not displaying:**
1. Check browser console for errors
2. Verify `hours.json` is valid JSON (use a JSON validator)
3. Ensure `hours.js` is loaded before other scripts that might depend on it
4. Check that element IDs match exactly

**Hours showing "Loading hours...":**
- The JSON file may not be loading (check network tab)
- Path to `dynamic/json/hours.json` may be incorrect
- CORS issues if testing locally (use a local server like `python3 -m http.server`)

## Benefits of This System

1. **Single Source of Truth**: Update hours in one place
2. **Consistency**: Same hours displayed everywhere
3. **Easy Maintenance**: No need to edit multiple HTML files
4. **Flexibility**: Easy to add hours to new pages
5. **Future-Proof**: Can easily add features like holiday hours or special events