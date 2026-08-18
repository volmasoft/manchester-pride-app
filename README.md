# Manchester Pride Events

A simple, lightweight event calendar for Manchester Pride that loads venue data from JSON files and renders a day-by-day timeline view.

## What the app does

- Displays events grouped by day
- Shows venue filters and ticket filters
- Renders a calendar-style timeline with overlapping events shown in separate lanes
- Opens an event details modal when an event card is clicked
- Loads venue data dynamically from the data folder

## Project structure

- index.html — page structure and styling
- app.js — event loading, filtering, timeline rendering, and modal logic
- data/ — venue JSON files

## Running locally

From the project folder, start a simple local server:

```bash
python3 -m http.server 8000
```

Then open in your browser:

```text
http://127.0.0.1:8000/
```

### Available pages

- **index.html** — Main event timeline with filters
- **accessible.html** — Simplified list view without filters
- **metrics.html** — Analytics and metrics dashboard
- **about.html** — Project information and QR code for sharing
- **venue.html** — Single venue focus page with venue selector and day filters

### Features

- **Share button** — Share the page via X, Facebook, or copy the URL (mobile uses native share sheet)
- **QR Code** — Available on the About page
- **Venue filtering** — Filter events by venue and day
- **Event details modal** — Click any event for more information

## Adding a new venue

1. Create a new JSON file in the data folder, for example:
   - data/my-venue.json
2. Use this structure:

```json
{
  "venue": "My Venue",
  "url": "https://example.com/my-venue",
  "color": "linear-gradient(135deg, #ff00aa 0%, #6600ff 100%)",
  "events": []
}
```

### Fields

- venue: the name shown in the app
- url: the venue website link
- color: the gradient used for event cards
- address: physical address of the venue (optional)
- mapsUrl: Google Maps link for the venue address (optional)
- events: an array of event objects

The app discovers venue files via a **manifest** at `data/venues.json`. When you add a new venue file, also add its path to that manifest so the app knows to load it:

```json
{
  "venues": [
    "data/via.json",
    "data/eagle.json",
    "data/nyny.json",
    "data/cockatoo-club.json",
    "data/my-venue.json"
  ]
}
```

> **Note:** The app also keeps a hardcoded list of known venue files as a fallback in `app.js` (`knownVenueFiles`). If the manifest is missing or inaccessible, the app will still load venues from that list. Update both the manifest and the fallback list when adding new venues for best reliability.

## Adding events to a venue

Add objects to the events array inside the venue JSON file.

Example:

```json
{
  "venue": "My Venue",
  "url": "https://example.com/my-venue",
  "color": "linear-gradient(135deg, #ff00aa 0%, #6600ff 100%)",
  "events": [
    {
      "title": "Late Night Cabaret",
      "day": "friday",
      "start": "20:00",
      "end": "23:00",
      "ticket": 12.50,
      "description": "A glamorous evening of performances and cocktails."
    }
  ]
}
```

### Event fields

- title: the event name
- day: one of wednesday, thursday, friday, saturday, sunday, monday
- start: start time in 24-hour format, for example 20:00
- end: end time in 24-hour format, for example 23:00
- ticket: optional ticket price
- description: optional event description shown in the details modal

## Notes

- Times are displayed in a 24-hour format internally and rendered in a user-friendly 12-hour style in the UI.
- If an event ends before it starts, the app treats it as running into the next day.
- If you want to change the venue colours, update the color field in the relevant JSON file.
- All pages have a Share button in the navigation bar that supports X (Twitter), Facebook, and copying the URL.
- The About page includes a QR code for easy mobile sharing of the website.
- Venue names throughout the app link to venue.html with the venue pre-selected for easy browsing.
