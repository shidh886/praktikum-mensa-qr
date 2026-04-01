# Mensa QR Backend (CPEE + Menu API)

This project is a lightweight backend and frontend setup for a "canteen menu display + QR code control" system.

The backend provides:

* A CPEE state machine endpoint (`/update`) for controlling screen state via QR scanning
* A menu API (`/api/menu`) using either the TUM eat-api or web scraping
* A health check endpoint (`/health`)

The repository also includes:

* A display page with QR-based interaction (`cpee-qr.html` + `cpee-qr.css`)
* A simple callback forwarding script (`send.php`)

---

## Features

* QR-driven screen navigation: intro → canteen list → menu view
* Configurable data source: eat-api (default) or web scraping (worker threads)
* Basic price formatting and label display
* Simple caching to avoid repeated requests for the same day

---

## Tech Stack

* Node.js + Express
* node-fetch v2
* cheerio (HTML parsing for scraping)
* worker_threads (background scraping)
* Frontend: HTML, CSS, jQuery, qrcode.js

---

## Project Structure

* `app.js`: main backend entry (API and CPEE state machine)
* `scrape-worker.js`: worker for scraping menu pages
* `cpee-qr.html`: display page (QR control + menu rendering)
* `cpee-qr.css`: styles for the display page
* `send.php`: callback proxy (for forwarding QR actions to CPEE)
* `mensa cpee.xml`: CPEE process/state machine definition
* `package.json`: dependency configuration

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

Notes:

* Dependencies are defined in `package.json`
* Running `npm install` will install all required packages such as `express`, `cheerio`, `node-fetch`, etc.
* `worker_threads` is built into Node.js and does not need installation

---

### 2. Run the server

```bash
node app.js
```

Local backend address:

```
http://localhost:9002
```

---

## Deployment and Endpoints

This system involves three types of endpoints:

### 1. Local Backend (Development)

```
http://localhost:9002
```

This is your Node.js backend providing:

* `/health`
* `/update`
* `/api/menu`

---

### 2. Deployed Backend (University Server)

When deployed on the TUM server, the backend is accessed via the port proxy:

```
https://lehre.bpm.in.tum.de/ports/9002/
```

Example:

```
https://lehre.bpm.in.tum.de/ports/9002/api/menu?canteen=garching
```

---

### 3. CPEE Frame Endpoint

```
https://cpee.org/out/frames/dinghao/
```

This endpoint is **not part of this backend**.

It is used by CPEE to:

* render UI frames
* display the screen
* receive updates from the workflow

This project communicates with CPEE via `/update` and callback mechanisms.

---

## API Endpoints

### GET /health

Health check endpoint.

```json
{ "status": "ok" }
```

---

### GET | POST | PUT /update

CPEE state machine endpoint.

Parameters:

* `state`
* `event`
* `canteen`

Returns the updated `state` and `canteen` for further transitions.

Example request:

```text
state=list&event=show-menu&canteen=garching
```

Example response:

```json
{ "state": "menu", "canteen": "garching" }
```

State transition logic is implemented in `handleUpdate` in `app.js`.

---

### GET /api/menu

Fetch menu data.

Example:

```text
/api/menu?canteen=garching&date=YYYY-MM-DD
```

Parameters:

* `canteen` (required)
* `date` (optional, defaults to today)

Example response:

```json
{
  "canteen": "garching",
  "eat_api_key": "mensa-garching",
  "date": "2026-04-01",
  "address": "Boltzmannstr. 19, 85748 Garching",
  "items": [
    {
      "name": "Pasta",
      "type": "Main",
      "prices": [
        { "label": "Students", "text": "2.50 €" }
      ],
      "labels": ["vegan"]
    }
  ],
  "source": "api"
}
```

Possible errors:

* `400`: missing `canteen`
* `404`: no menu for the given date
* `502`: scraping failed

---

## Menu Data Source Configuration

Menu sources are configured in `getCanteenSource` in `app.js`.

* `type: 'api'`: fetch from eat-api
* `type: 'scrape'`: scrape from a website

Example:

```js
Boltzmann: {
  type: 'scrape',
  target: 'https://www.studierendenwerk-muenchen-oberbayern.de/mensa/speiseplan/speiseplan_457_-de.html'
}
```

Address mappings can be maintained in `getCanteenAddress`.

---

## Display Page (QR Control)

Entry file: `cpee-qr.html`

Supported URL parameters:

* `?view=intro`: main screen
* `?view=list`: canteen list
* `?view=menu&canteen=garching`: menu view

The page reads a callback URL from `window.name` or `?cb=` and generates QR codes accordingly.
QR actions are sent via `send.php` to the CPEE backend.

Menu data is fetched from:

```
https://lehre.bpm.in.tum.de/ports/9002/api/menu?canteen=xxx
```

For local testing, replace this with:

```
http://localhost:9002/api/menu?canteen=xxx
```

---

## send.php

`send.php` is a simple proxy script:

* Receives `info` and `cb` parameters
* Sends `info` to `cb` using a PUT request
* Outputs the response status and content

It is used to forward QR-triggered actions to the CPEE system.

---

## Common Issues

1. No menu found in eat-api
   This may happen on weekends or holidays (returns 404).

2. Scraping returns no data
   The target website structure may have changed; update selectors in `scrape-worker.js`.

3. Changing the port
   Modify the `PORT` constant in `app.js`.

---

## Development Notes

* Add more canteens by extending `getCanteenSource` and `mapCanteenToEatApiKey`
* Consider caching or scheduled updates for scraping sources
* Ensure worker threads are supported when deploying

---

## License

No license file is currently included.
This project is intended for academic and internal use.

This project is intended for academic and internal use.
