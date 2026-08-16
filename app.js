// Share functionality - Native share on mobile, fallback for desktop
const SHARE_URL = 'https://www.manchesterprideevents.com';
const SHARE_TITLE = 'Manchester Pride Events 2026';

function showSharePrompt(event) {
  if (event) event.preventDefault();
  
  const url = SHARE_URL;
  const title = SHARE_TITLE;
  
  // Try native share API first on mobile
  if (navigator.share) {
    navigator.share({
      title: title,
      url: url
    }).catch(err => {
      // Native share failed, fall back to prompt
      showShareFallback();
    });
  } else {
    showShareFallback();
  }
}

function showShareFallback() {
  const choice = prompt('Share with which platform?\n\nX (Twitter)\nFacebook\nOr type "copy" to copy the URL:', 'X');
  
  if (!choice) return; // User cancelled
  
  const normalizedChoice = choice.toLowerCase().trim();
  const url = SHARE_URL;
  const title = SHARE_TITLE;
  
  if (normalizedChoice === 'x' || normalizedChoice === 'twitter') {
    const tweetUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
    window.open(tweetUrl, '_blank', 'noopener,noreferrer');
  } else if (normalizedChoice === 'facebook') {
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    window.open(fbUrl, '_blank', 'noopener,noreferrer');
  } else if (normalizedChoice === 'copy') {
    navigator.clipboard.writeText(url).then(() => {
      alert('URL copied to clipboard!');
    });
  } else if (normalizedChoice === 'instagram' || normalizedChoice === 'insta') {
    // Instagram shares via clipboard + manual paste
    navigator.clipboard.writeText(url).then(() => {
      alert('URL copied!\n\nInstagram sharing works best from the app.\nYou can paste the URL in Stories or a post.');
    });
  }
}

const days = [
  { key: 'wednesday', label: 'Wed 26' },
  { key: 'thursday', label: 'Thurs 27' },
  { key: 'friday', label: 'Fri 28' },
  { key: 'saturday', label: 'Sat 29' },
  { key: 'sunday', label: 'Sun 30' },
  { key: 'monday', label: 'Mon 31' }
];

let allEvents = [];
// Single selected day (starts as first day, defaulting to 'wednesday').
let activeDay = 'wednesday';
let activeVenues = new Set();
// Tracks whether the venue filter list has been initialised with its default
// "every venue selected" state. We use a flag (rather than checking
// `activeVenues.size`) so that a deliberate "Unselect all" leaves the set
// empty instead of being silently re-populated on the next render.
let venueSelectionInitialized = false;
let ticketFilterModes = {
  all: true,
  ticketed: true,
  nonTicketed: true
};

// Tracks the expanded/collapsed state of each collapsible filter section.
// We persist it in a variable (rather than reading the DOM) because every
// checkbox change rebuilds the filter UI from scratch via setupVenueFilters.
// Sections start collapsed by default to keep the toolbar compact.
let filterPanelState = {
  eventFilters: false
};

// localStorage key for persisting filter state across reloads.
const FILTERS_STORAGE_KEY = 'manchesterPrideFilters';

// Persists the current filter state (panel open/closed state, ticket modes and
// selected venues) to localStorage so it survives page reloads and browser
// restarts. Wrapped in try/catch because localStorage can be unavailable
// (e.g. strict/private browsing) — in that case we just skip saving and the
// app still works normally for the current session.
function saveFilters() {
  try {
    const state = {
      filterPanelState,
      ticketFilterModes,
      activeVenues: [...activeVenues],
      activeDay
    };
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    // Storage unavailable; fail silently.
  }
}

// Restores filter state from localStorage, if present. Returns true when state
// was restored, falling back to the in-memory defaults otherwise.
function loadFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw);

    if (state.filterPanelState) {
      filterPanelState = { ...filterPanelState, ...state.filterPanelState };
    }
    if (state.ticketFilterModes) {
      ticketFilterModes = { ...ticketFilterModes, ...state.ticketFilterModes };
    }
    if (Array.isArray(state.activeVenues)) {
      activeVenues = new Set(state.activeVenues);
      // Mark as initialised so setupVenueFilters doesn't overwrite the restored
      // selection with the default "every venue selected" state.
      venueSelectionInitialized = true;
    }
    if (typeof state.activeDay === 'string' && days.some(d => d.key === state.activeDay)) {
      activeDay = state.activeDay;
    }
    return true;
  } catch (error) {
    // Corrupt or unreadable storage — ignore and fall back to defaults.
    return false;
  }
}

// In-memory cache of parsed venue manifests, keyed by file URL.
// The venue data is static for a given page session, so we only ever
// fetch + parse each file once. Subsequent loads are instant.
let venueFileCache = new Map();

async function fetchVenueFile(file) {
  if (venueFileCache.has(file)) {
    return venueFileCache.get(file);
  }
  const response = await fetch(file, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${file}`);
  const venueData = await response.json();
  venueFileCache.set(file, venueData);
  return venueData;
}

async function discoverVenueFiles() {
  const response = await fetch('./data/venues.json', { cache: 'no-store' });

  if (!response.ok) {
    throw new Error('Could not load venue manifest from data/venues.json');
  }

  const manifest = await response.json();
  const files = manifest.venues || manifest.files || [];
  const valid = files
    .map(path => path.replace(/^\/+/, ''))
    .filter(path => path.endsWith('.json') && path.startsWith('data/'))
    .filter((path, index, paths) => paths.indexOf(path) === index);

  if (!valid.length) {
    throw new Error('No venue files were found in data/venues.json');
  }

  return valid;
}

function normalizeDayKey(day) {
  return String(day || '').trim().toLowerCase();
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatTime(value) {
  const [hours, minutes] = value.split(':').map(Number);
  const suffix = hours >= 12 ? 'pm' : 'am';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, '0')}${suffix}`;
}

function formatTimeRange(start, end) {
  const endText = timeToMinutes(end) < timeToMinutes(start)
    ? `${formatTime(end)} (next day)`
    : formatTime(end);
  return `${formatTime(start)}–${endText}`;
}

function formatHourLabel(hour) {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const suffix = normalizedHour >= 12 ? 'pm' : 'am';
  const hour12 = normalizedHour % 12 || 12;
  return `${hour12}${suffix}`;
}

function getEventMinutes(event) {
  const startMinutes = timeToMinutes(event.start);
  const endMinutes = timeToMinutes(event.end) < startMinutes
    ? timeToMinutes(event.end) + 24 * 60
    : timeToMinutes(event.end);
  return { startMinutes, endMinutes };
}

function overlaps(a, b) {
  const aBounds = getEventMinutes(a);
  const bBounds = getEventMinutes(b);
  return aBounds.startMinutes < bBounds.endMinutes && aBounds.endMinutes > bBounds.startMinutes;
}

async function loadEvents() {
  allEvents = [];
  const venueFiles = await discoverVenueFiles();

  if (!venueFiles.length) {
    throw new Error('No venue data files were found in the data folder.');
  }

  // Fetch every venue file concurrently. This runs in parallel rather than
  // sequentially, so total load time is ~1 slowest request instead of the sum
  // of every request. Each result is cached in `venueFileCache` so later
  // loads don't hit the network at all.
  const results = await Promise.all(
    venueFiles.map(file => fetchVenueFile(file))
  );

  allEvents = results.flatMap(venueData =>
    venueData.events.map(event => ({
      ...event,
      day: normalizeDayKey(event.day),
      venue: venueData.venue,
      venueUrl: venueData.url || '',
      venueColor: venueData.color || '',
      official: venueData.official === true
    }))
  );

  return allEvents.sort((a, b) => {
    const dayOrder = { wednesday: 0, thursday: 1, friday: 2, saturday: 3, sunday: 4, monday: 5 };
    return dayOrder[a.day] - dayOrder[b.day] || timeToMinutes(a.start) - timeToMinutes(b.start);
  });
}

function showEventDetails(event) {
  const modalContainer = document.getElementById('eventModal');
  modalContainer.innerHTML = '';

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.addEventListener('click', event => {
    if (event.target === backdrop) {
      modalContainer.innerHTML = '';
    }
  });

  const modal = document.createElement('div');
  modal.className = 'modal-card';

  const heading = document.createElement('h2');
  heading.textContent = event.title;

  const details = document.createElement('p');
  details.innerHTML = `
    <strong>Venue:</strong> ${event.venue}<br>
    <strong>Time:</strong> ${formatTimeRange(event.start, event.end)}<br>
    <strong>Description:</strong> ${event.description || 'No description provided.'}
  `;

  const closeButton = document.createElement('button');
  closeButton.className = 'modal-close';
  closeButton.textContent = 'Close';
  closeButton.addEventListener('click', () => {
    modalContainer.innerHTML = '';
  });

  modal.append(heading, details, closeButton);
  backdrop.appendChild(modal);
  modalContainer.appendChild(backdrop);
}

function getVenueGradient(event) {
  return event.venueColor || 'linear-gradient(135deg, #ec4899, #8b5cf6)';
}

function createEventCard(event, topPx, heightPx, leftPx, widthPx) {
  const card = document.createElement('div');
  card.className = 'event-card calendar-event-card';
  card.style.background = getVenueGradient(event);
  card.style.cursor = 'pointer';
  card.style.top = `${topPx}px`;
  card.style.height = `${heightPx}px`;
  card.style.left = `${leftPx}px`;
  card.style.width = `${widthPx}px`;
  card.addEventListener('click', () => showEventDetails(event));

  const titleRow = document.createElement('div');
  titleRow.className = 'title-row';

  const title = document.createElement('strong');
  const ticketPrice = event.ticket;
  const hasTicket = ticketPrice !== undefined && ticketPrice !== null && ticketPrice !== '';

  const titleText = document.createTextNode(event.title);
  title.appendChild(titleText);

  if (hasTicket) {
    const ticketIcon = document.createElement('span');
    ticketIcon.className = 'ticket-icon';
    ticketIcon.textContent = '🎟️';

    const priceText = document.createElement('span');
    priceText.textContent = ` (£${Number(ticketPrice).toFixed(2)})`;

    titleRow.appendChild(title);
    titleRow.appendChild(ticketIcon);
    titleRow.appendChild(priceText);
  } else {
    titleRow.appendChild(title);
  }

  const venue = document.createElement('small');
    const venueLink = document.createElement('a');
    venueLink.href = 'venue.html?venue=' + encodeURIComponent(event.venue);
    venueLink.target = '_blank';
    venueLink.rel = 'noopener noreferrer';
    venueLink.textContent = `Venue: ${event.venue}`;
    venueLink.style.color = 'white';
    venueLink.style.textDecoration = 'underline';
    venue.appendChild(venueLink);

  const details = document.createElement('small');
  details.textContent = formatTimeRange(event.start, event.end);

  card.append(titleRow, venue, details);

  if (event.official) {
    const star = document.createElement('span');
    star.className = 'official-star';
    star.setAttribute('aria-label', 'Official venue');
    star.textContent = '★';
    card.appendChild(star);
  }

  return card;
}

function createCollapsiblePanel(title, panelKey) {
  const root = document.createElement('div');
  root.className = 'filter-panel collapsible-panel';

  const header = document.createElement('div');
  header.className = 'collapsible-header';

  const heading = document.createElement('h3');
  heading.textContent = title;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'collapse-toggle';
  const isExpanded = filterPanelState[panelKey];
  toggle.setAttribute('aria-expanded', String(isExpanded));
  toggle.setAttribute('aria-controls', `${panelKey}Content`);
  toggle.title = isExpanded ? 'Collapse this section' : 'Expand this section';
  toggle.addEventListener('click', () => {
    filterPanelState[panelKey] = !filterPanelState[panelKey];
    setupVenueFilters(allEvents);
  });
  if (!isExpanded) toggle.classList.add('collapsed');

  const chevron = document.createElement('span');
  chevron.className = 'chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '▼';
  toggle.appendChild(chevron);

  header.append(heading, toggle);

  const content = document.createElement('div');
  content.className = 'collapsible-content';
  content.id = `${panelKey}Content`;
  if (!isExpanded) content.classList.add('collapsed');

  root.append(header, content);
  return { root, content };
}

function setupVenueFilters(events) {
  const filters = document.getElementById('venueFilters');
  filters.innerHTML = '';

  // --- Days dropdown (first, no collapsible panel) ---
  const daySelect = document.createElement('select');
  daySelect.className = 'day-select';
  daySelect.setAttribute('aria-label', 'Select day to view events');
  days.forEach(day => {
    const option = document.createElement('option');
    option.value = day.key;
    option.textContent = day.label;
    if (day.key === activeDay) option.selected = true;
    daySelect.appendChild(option);
  });
  daySelect.addEventListener('change', () => {
    activeDay = daySelect.value;
    renderTimeline(allEvents);
    setupVenueFilters(allEvents);
  });
  filters.appendChild(daySelect);

  // --- Event Filters panel (second, contains Tickets + Venues) ---
  const eventPanel = createCollapsiblePanel('Event Filters', 'eventFilters');

  const eventContent = eventPanel.content;

  // --- Ticket Type section ---
  const ticketHeader = document.createElement('div');
  ticketHeader.className = 'filter-section-header';
  const ticketHeading = document.createElement('h4');
  ticketHeading.textContent = 'Ticket Type';
  ticketHeading.className = 'filter-section-title';
  ticketHeader.appendChild(ticketHeading);
  eventContent.appendChild(ticketHeader);

  const ticketGroup = document.createElement('div');
  ticketGroup.className = 'filter-group';

  const ticketOptions = [
    { key: 'all', label: 'All' },
    { key: 'ticketed', label: 'Ticketed events' },
    { key: 'nonTicketed', label: 'Non-ticketed only' }
  ];

  ticketOptions.forEach(option => {
    const chip = document.createElement('label');
    chip.className = 'filter-chip';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = ticketFilterModes[option.key];
    checkbox.addEventListener('change', () => {
      if (option.key === 'all') {
        ticketFilterModes = {
          all: checkbox.checked,
          ticketed: checkbox.checked,
          nonTicketed: checkbox.checked
        };
      } else {
        ticketFilterModes[option.key] = checkbox.checked;
        ticketFilterModes.all = ticketFilterModes.ticketed && ticketFilterModes.nonTicketed;
      }

      renderTimeline(allEvents);
      setupVenueFilters(allEvents);
    });

    const label = document.createElement('span');
    label.textContent = option.label;

    chip.append(checkbox, label);
    ticketGroup.appendChild(chip);
  });

  eventContent.appendChild(ticketGroup);

  // --- Venue section ---
  const venues = [...new Set(events.map(event => event.venue))].sort();

  // If no venues, skip venue section but still add the panel and reset button
  if (venues.length) {
    const venueHeader = document.createElement('div');
    venueHeader.className = 'filter-section-header';
    const venueHeading = document.createElement('h4');
    venueHeading.textContent = 'Venue';
    venueHeading.className = 'filter-section-title';
    venueHeader.appendChild(venueHeading);
    eventContent.appendChild(venueHeader);

    const venueGroup = document.createElement('div');
    venueGroup.className = 'filter-group';

    const venueOfficial = {};
    events.forEach(event => {
      if (event.official) venueOfficial[event.venue] = true;
    });

    if (!venueSelectionInitialized) {
      activeVenues = new Set(venues);
      venueSelectionInitialized = true;
    }

    // If the venue selection was restored from storage, drop any venues that are
    // no longer present in the loaded data so the status count stays accurate.
    // (When no state was restored, activeVenues already matches `venues`.)
    const knownVenues = new Set(venues);
    activeVenues = new Set([...activeVenues].filter(venue => knownVenues.has(venue)));

    venues.forEach(venue => {
      const chip = document.createElement('label');
      chip.className = 'filter-chip';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = activeVenues.has(venue);
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          activeVenues.add(venue);
        } else {
          activeVenues.delete(venue);
        }
        renderTimeline(allEvents);
        // This handler only re-renders the timeline (it doesn't rebuild the
        // filter UI), so persist the selection explicitly.
        saveFilters();
      });

      const label = document.createElement('span');
      const labelText = document.createTextNode(venue);

      if (venueOfficial[venue]) {
        const star = document.createElement('span');
        star.className = 'venue-official-star';
        star.setAttribute('aria-label', 'Official venue');
        star.textContent = '★';
        label.append(star, ' ', labelText);
      } else {
        label.appendChild(labelText);
      }

      chip.append(checkbox, label);
      venueGroup.appendChild(chip);
    });

    eventContent.appendChild(venueGroup);

    const actions = document.createElement('div');
    actions.className = 'filter-actions';

    const selectAllButton = document.createElement('button');
    selectAllButton.className = 'reset-button';
    selectAllButton.textContent = 'Select all';
    selectAllButton.title = 'Select all venues';
    selectAllButton.addEventListener('click', () => {
      activeVenues = new Set(venues);
      renderTimeline(allEvents);
      setupVenueFilters(allEvents);
    });

    const unselectAllButton = document.createElement('button');
    unselectAllButton.className = 'reset-button';
    unselectAllButton.textContent = 'Unselect all';
    unselectAllButton.title = 'Deselect all venues';
    unselectAllButton.addEventListener('click', () => {
      activeVenues = new Set();
      renderTimeline(allEvents);
      setupVenueFilters(allEvents);
    });

    actions.append(selectAllButton, unselectAllButton);
    eventContent.appendChild(actions);
  }

  filters.appendChild(eventPanel.root);

  // --- Global reset (always visible, resets every filter) ---
  const resetButton = document.createElement('button');
  resetButton.className = 'reset-button filter-global-reset';
  resetButton.textContent = 'Reset filters';
  resetButton.addEventListener('click', () => {
    ticketFilterModes = { all: true, ticketed: true, nonTicketed: true };
    activeVenues = new Set(venues);
    // If no venues exist, start with empty selection
    if (!venues.length) {
      activeVenues = new Set();
      venueSelectionInitialized = true;
    }
    activeDay = 'wednesday';
    renderTimeline(allEvents);
    setupVenueFilters(allEvents);
  });

  filters.appendChild(resetButton);

  // Persist the latest state now that the UI reflects it. Every handler that
  // mutates filter state funnels through setupVenueFilters (except the venue
  // and day checkbox handlers, which save explicitly), so this keeps storage
  // in sync.
  saveFilters();
}

function renderTimeline(events) {
  const timeline = document.getElementById('timeline');
  timeline.innerHTML = '';

  const dayEvents = events
    .filter(event => event.day === activeDay)
    .filter(event => activeVenues.has(event.venue))
    .filter(event => {
      const hasTicket = event.ticket !== undefined && event.ticket !== null && event.ticket !== '';
      const ticketChoice = hasTicket ? 'ticketed' : 'nonTicketed';
      return (ticketFilterModes.all || ticketFilterModes[ticketChoice]);
    })
    .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  if (!dayEvents.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No events match the selected venues for this day yet.';
    timeline.appendChild(empty);
    return;
  }

  const hourHeight = 72;
  const firstHour = Math.floor(Math.min(...dayEvents.map(event => timeToMinutes(event.start))) / 60);
  const lastHour = Math.ceil(Math.max(...dayEvents.map(event => {
    const { endMinutes } = getEventMinutes(event);
    return endMinutes / 60;
  })) / 1) + 1;
  const timelineHeight = (lastHour - firstHour) * hourHeight;
  const sortedEvents = [...dayEvents].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const placedEvents = [];
  const laneEndTimes = [];

  sortedEvents.forEach(event => {
    const { startMinutes, endMinutes } = getEventMinutes(event);
    let laneIndex = 0;

    while (laneIndex < laneEndTimes.length && laneEndTimes[laneIndex] > startMinutes) {
      laneIndex += 1;
    }

    if (laneIndex === laneEndTimes.length) {
      laneEndTimes.push(endMinutes);
    } else {
      laneEndTimes[laneIndex] = endMinutes;
    }

    placedEvents.push({ event, laneIndex });
  });

  const calendar = document.createElement('div');
  calendar.className = 'timeline-calendar';
  calendar.style.height = `${timelineHeight}px`;

  const hours = document.createElement('div');
  hours.className = 'timeline-hours';
  for (let hour = firstHour; hour < lastHour; hour += 1) {
    const hourRow = document.createElement('div');
    hourRow.className = 'timeline-hour';

    const label = document.createElement('div');
    label.className = 'timeline-hour-label';
    label.textContent = formatHourLabel(hour);

    const line = document.createElement('div');
    line.className = 'timeline-hour-line';

    hourRow.append(label, line);
    hours.appendChild(hourRow);
  }

  const eventsLayer = document.createElement('div');
  eventsLayer.className = 'timeline-events';
  eventsLayer.style.height = `${timelineHeight}px`;

  const maxLanes = Math.max(1, ...placedEvents.map(({ laneIndex }) => laneIndex + 1));
  const laneGap = 8;
  const eventCards = [];

  placedEvents.forEach(({ event, laneIndex }) => {
    const { startMinutes, endMinutes } = getEventMinutes(event);
    const topPx = ((startMinutes / 60) - firstHour) * hourHeight;
    const durationHours = Math.max(1, Math.ceil((endMinutes - startMinutes) / 60));
    const heightPx = Math.max(hourHeight * durationHours, 48);
    const eventCard = createEventCard(event, topPx, heightPx, 0, 0);
    eventCards.push({ card: eventCard, laneIndex });
    eventsLayer.appendChild(eventCard);
  });

  requestAnimationFrame(() => {
    const layerWidth = eventsLayer.clientWidth || 320;
    const laneWidth = Math.max(140, (layerWidth - laneGap * Math.max(0, maxLanes - 1)) / maxLanes);

    eventCards.forEach(({ card, laneIndex }) => {
      card.style.left = `${laneIndex * (laneWidth + laneGap)}px`;
      card.style.width = `${laneWidth}px`;
    });
  });

  calendar.append(hours, eventsLayer);
  timeline.appendChild(calendar);

  const status = document.getElementById('status');
  const dayLabel = days.find(day => day.key === activeDay)?.label || activeDay;
  const visibleVenueCount = activeVenues.size;
  const activeTicketModes = Object.entries(ticketFilterModes)
    .filter(([, selected]) => selected)
    .map(([key]) => key === 'all' ? 'all' : key === 'ticketed' ? 'ticketed' : 'non-ticketed');
  const ticketStatus = activeTicketModes.length === 3 || (activeTicketModes.length === 2 && activeTicketModes.includes('all'))
    ? 'all ticket types'
    : activeTicketModes.join(', ');
  status.textContent = `${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'} shown for ${dayLabel} (${visibleVenueCount} venue${visibleVenueCount === 1 ? '' : 's'} selected, ${ticketStatus})`;
}

function renderVenueMetrics(events) {
  const container = document.getElementById('venueMetrics');
  const dayKeys = days.map(day => day.key);

  const venues = [...new Set(events.map(event => event.venue))].sort();

  // Build a count matrix: counts[venue][day]
  const counts = {};
  venues.forEach(venue => {
    counts[venue] = {};
    dayKeys.forEach(day => { counts[venue][day] = 0; });
  });
  events.forEach(event => {
    if (counts[event.venue]) {
      const dayKey = normalizeDayKey(event.day);
      if (counts[event.venue][dayKey] !== undefined) {
        counts[event.venue][dayKey] += 1;
      }
    }
  });

  container.innerHTML = '';

  // Add a visually hidden heading for the table for proper accessibility structure
  const tableHeading = document.createElement('h2');
  tableHeading.className = 'visually-hidden';
  tableHeading.textContent = 'Venue event metrics table';
  container.appendChild(tableHeading);

  const table = document.createElement('table');
  table.className = 'metrics-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  const nameHeader = document.createElement('th');
  nameHeader.textContent = 'Venue';
  headerRow.appendChild(nameHeader);

  dayKeys.forEach(day => {
    const th = document.createElement('th');
    const dayObj = days.find(d => d.key === day);
    th.textContent = dayObj ? dayObj.label : day;
    headerRow.appendChild(th);
  });

  const totalHeader = document.createElement('th');
  totalHeader.textContent = 'Total';
  headerRow.appendChild(totalHeader);

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  venues.forEach(venue => {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    const venueLink = document.createElement('a');
    venueLink.href = 'venue.html?venue=' + encodeURIComponent(venue);
    venueLink.className = 'venue-link';
    venueLink.textContent = venue;
    venueLink.setAttribute('aria-label', 'View events for ' + venue);
    nameCell.appendChild(venueLink);
    nameCell.className = 'venue-name';
    row.appendChild(nameCell);

    let rowTotal = 0;
    dayKeys.forEach(day => {
      const count = counts[venue][day] || 0;
      const td = document.createElement('td');
      td.textContent = count;
      if (count === 0) {
        td.classList.add('empty');
      }
      rowTotal += count;
      row.appendChild(td);
    });

    const totalCell = document.createElement('td');
    totalCell.textContent = rowTotal;
    totalCell.className = 'total';
    row.appendChild(totalCell);

    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  container.appendChild(table);
}

async function init() {
  try {
    // Restore persisted filter state before building the UI so the collapsed
    // panels, ticket modes and venue selections reflect the user's last
    // settings.
    loadFilters();
    const loadedEvents = await loadEvents();
    setupVenueFilters(loadedEvents);
    renderTimeline(loadedEvents);
    // You only need to see one day at a time, so build the secondary metrics
    // table in idle time — let the timeline paint first.
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => renderVenueMetrics(loadedEvents));
    } else {
      setTimeout(() => renderVenueMetrics(loadedEvents), 0);
    }
  } catch (error) {
    document.getElementById('status').textContent = error.message;
  }
}

init();
