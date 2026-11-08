// ===== Calendar Grid - Event Planner
// This calendar loads events from the ICS parser in calendar.js

const $ = (s) => document.querySelector(s);

// ===== Elements
const grid = $("#grid");
const monthLabel = $("#monthLabel");
const status = $("#status");
const search = $("#search");
const todayBtn = $("#today");
const prevBtn = $("#prev");
const nextBtn = $("#next");
const addBtn = $("#add");

const dayLabel = $("#dayLabel");
const dayCount = $("#dayCount");
const dayList = $("#dayList");
const upcomingList = $("#upcomingList");
const statWeek = $("#statWeek");
const statMonth = $("#statMonth");
const statAll = $("#statAll");

const dlg = $("#dlg");
const dlgTitle = $("#dlgTitle");
const fTitle = $("#fTitle");
const fDate = $("#fDate");
const fStart = $("#fStart");
const fEnd = $("#fEnd");
const fColor = $("#fColor");
const fLoc = $("#fLoc");
const fNotes = $("#fNotes");
const btnDelete = $("#btnDelete");
const tplEvent = $("#tplEvent");

// ===== State
let view = firstOfMonth(new Date()); // current month view
let selected = new Date(); // currently selected day
let editingId = null;
let events = []; // Will be populated from ICS parser

// ===== Helpers (dates)
function pad2(n) {
  return String(n).padStart(2, "0");
}

function iso(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function firstOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d, n) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function startOfWeek(d) {
  // Monday
  const t = new Date(d);
  const day = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - day);
  t.setHours(0, 0, 0, 0);
  return t;
}

function endOfWeek(d) {
  const t = startOfWeek(d);
  t.setDate(t.getDate() + 6);
  return t;
}

function daysInMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

// ===== Convert ICS events to calendar format
function convertICSEventsToCalendarFormat(icsEvents) {
  const colors = ['#38bdf8', '#8b5cf6', '#22c55e', '#f59e0b', '#ef4444'];
  let colorIndex = 0;

  return icsEvents.map((event) => {
    const color = colors[colorIndex % colors.length];
    colorIndex++;

    const startDate = new Date(event.start);
    const endDate = new Date(event.end);

    // Format times
    const startTime = event.isAllDay ? '' : pad2(startDate.getHours()) + ':' + pad2(startDate.getMinutes());
    const endTime = event.isAllDay ? '' : pad2(endDate.getHours()) + ':' + pad2(endDate.getMinutes());

    return {
      id: Date.now() + Math.random(),
      title: event.title,
      date: iso(startDate),
      start: startTime,
      end: endTime,
      color: color,
      loc: event.location || '',
      notes: event.description || '',
      isAllDay: event.isAllDay
    };
  });
}

// ===== Rendering
function render() {
  renderCalendar();
  renderSidebars();
  status.textContent = `${events.length} events`;
}

function renderCalendar() {
  monthLabel.textContent = view.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
  grid.innerHTML = "";

  const first = firstOfMonth(view);
  const start = startOfWeek(first);
  const last = new Date(view.getFullYear(), view.getMonth(), daysInMonth(view));
  const end = endOfWeek(last);

  let d = new Date(start);
  while (d <= end) {
    const cell = document.createElement("div");
    cell.className = "cell";
    const out = d.getMonth() !== view.getMonth();
    if (out) cell.classList.add("out");
    if (iso(d) === iso(new Date())) cell.classList.add("today");
    if (iso(d) === iso(selected)) cell.classList.add("sel");

    const top = document.createElement("div");
    top.className = "top";
    const dd = document.createElement("div");
    dd.className = "d";
    dd.textContent = d.getDate();
    const badge = document.createElement("div");
    badge.className = "badge";
    const dots = document.createElement("div");
    dots.className = "dots";

    const evs = eventsForDate(iso(d));
    if (evs.length) {
      badge.textContent =
        evs.length + (evs.length === 1 ? " event" : " events");
      evs.slice(0, 6).forEach((e) => {
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.style.background = e.color || "#38bdf8";
        dots.appendChild(dot);
      });
    } else badge.textContent = "";

    top.append(dd, badge);
    cell.append(top, dots);
    cell.addEventListener("click", () => {
      selected = new Date(d);
      renderSidebars();
    });
    grid.appendChild(cell);
    d.setDate(d.getDate() + 1);
  }
}

function renderSidebars() {
  // Day panel
  dayLabel.textContent = selected.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const list = eventsForDate(iso(selected)).sort(sortByTime);
  dayCount.textContent = list.length
    ? `${list.length} event${list.length === 1 ? "" : "s"}`
    : "No events";
  dayList.innerHTML = "";
  list.forEach((ev) => dayList.appendChild(renderEventItem(ev)));

  // Upcoming
  const up = events
    .filter((e) => new Date(e.date) >= startOfDay(new Date()))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    .slice(0, 10);
  upcomingList.innerHTML = "";
  up.forEach((e) => upcomingList.appendChild(renderEventItem(e, true)));

  // Stats
  const startW = startOfWeek(new Date());
  const endW = endOfWeek(new Date());
  const thisWeek = events.filter((e) => inRange(new Date(e.date), startW, endW))
    .length;
  const thisMonth = events.filter(
    (e) =>
      new Date(e.date).getMonth() === new Date().getMonth() &&
      new Date(e.date).getFullYear() === new Date().getFullYear()
  ).length;
  statWeek.textContent = thisWeek;
  statMonth.textContent = thisMonth;
  statAll.textContent = events.length;

  // Repaint month (to update selected highlight + dots counts)
  renderCalendar();
}

function renderEventItem(ev, compact = false) {
  const li = tplEvent.content.firstElementChild.cloneNode(true);
  li.querySelector(".dot").style.background = ev.color || "#38bdf8";
  li.querySelector(".t").textContent = ev.title;
  const tStr =
    ev.start || ev.end ? `${ev.start || "—"}–${ev.end || "—"}` : "All day";
  li.querySelector(".time").textContent = `${formatDate(ev.date)} ${tStr}`;
  li.querySelector(".loc").textContent = ev.loc ? ev.loc : "";
  if (compact) {
    li.querySelector(".time").textContent =
      (ev.start || "—") + (ev.end ? `–${ev.end}` : "");
  }

  // edit/delete
  li.querySelector(".edit").addEventListener("click", () => openEdit(ev.id));
  li.querySelector(".del").addEventListener("click", () => del(ev.id));
  return li;
}

function formatDate(s) {
  try {
    const d = new Date(s + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  } catch {
    return s;
  }
}

function sortByTime(a, b) {
  return (a.start || "00:00").localeCompare(b.start || "00:00");
}

function eventsForDate(isostr) {
  return events.filter((e) => e.date === isostr);
}

function startOfDay(d) {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  return t;
}

function inRange(d, a, b) {
  const dd = startOfDay(d).getTime();
  return dd >= startOfDay(a).getTime() && dd <= startOfDay(b).getTime();
}

// ===== CRUD
function openAdd(dateISO = iso(selected)) {
  editingId = null;
  dlgTitle.textContent = "Add event";
  fTitle.value = "";
  fDate.value = dateISO;
  fStart.value = "";
  fEnd.value = "";
  fColor.value = "#38bdf8";
  fLoc.value = "";
  fNotes.value = "";
  btnDelete.style.display = "none";
  dlg.showModal();
}

function openEdit(id) {
  editingId = id;
  const e = events.find((x) => x.id === id);
  if (!e) return;
  dlgTitle.textContent = "Edit event";
  fTitle.value = e.title;
  fDate.value = e.date;
  fStart.value = e.start || "";
  fEnd.value = e.end || "";
  fColor.value = e.color || "#38bdf8";
  fLoc.value = e.loc || "";
  fNotes.value = e.notes || "";
  btnDelete.style.display = "";
  dlg.showModal();
}

btnDelete.addEventListener("click", (e) => {
  e.preventDefault();
  if (!editingId) return;
  if (!confirm("Delete this event?")) return;
  events = events.filter((ev) => ev.id !== editingId);
  dlg.close();
  render();
});

$("#btnSave").addEventListener("click", (e) => {
  e.preventDefault();
  const data = {
    title: fTitle.value.trim(),
    date: fDate.value,
    start: fStart.value || "",
    end: fEnd.value || "",
    color: fColor.value || "#38bdf8",
    loc: fLoc.value.trim(),
    notes: fNotes.value.trim()
  };
  if (!data.title || !data.date) {
    alert("Title and Date are required.");
    return;
  }
  if (editingId) {
    const i = events.findIndex((x) => x.id === editingId);
    events[i] = { ...events[i], ...data };
  } else {
    events.push({ id: Date.now(), ...data });
  }
  dlg.close();
  render();
});

// ===== Nav / Search
todayBtn.addEventListener("click", () => {
  selected = new Date();
  view = firstOfMonth(new Date());
  render();
});

prevBtn.addEventListener("click", () => {
  view = addMonths(view, -1);
  render();
});

nextBtn.addEventListener("click", () => {
  view = addMonths(view, 1);
  render();
});

addBtn.addEventListener("click", () => {
  // Redirect to Google Calendar for now
  window.location.href = "https://google.com";
});

search.addEventListener("input", () => {
  const q = search.value.trim().toLowerCase();
  const all = Array.from(document.querySelectorAll(".events .ev"));
  if (!q) {
    all.forEach((el) => (el.style.opacity = ""));
    return;
  }
  all.forEach((el) => {
    const text = el.innerText.toLowerCase();
    el.style.opacity = text.includes(q) ? "1" : "0.35";
  });
});

// ===== Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (dlg.open) return;
  if (e.key.toLowerCase() === "n") {
    openAdd();
  }
  if (e.key.toLowerCase() === "t") {
    todayBtn.click();
  }
  if (e.key === "ArrowLeft") {
    prevBtn.click();
  }
  if (e.key === "ArrowRight") {
    nextBtn.click();
  }
});

// ===== Delete (inline)
function del(id) {
  if (!confirm("Delete this event?")) return;
  events = events.filter((e) => e.id !== id);
  render();
}

// ===== Initialize calendar with ICS events
function initializeCalendarWithICSEvents(icsEvents) {
  console.log(`Initializing calendar grid with ${icsEvents.length} ICS events`);
  events = convertICSEventsToCalendarFormat(icsEvents);
  console.log(`Converted to ${events.length} calendar events`);
  render();
}

// Export function for use by calendar.js
window.initializeCalendarWithICSEvents = initializeCalendarWithICSEvents;
