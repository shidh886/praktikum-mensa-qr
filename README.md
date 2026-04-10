# Mensa QR Menu Display System

This project is a lightweight backend and frontend setup for a **canteen menu display + QR code control** system.

It combines a Node.js backend, a browser-based display page, a PHP callback proxy, and a CPEE workflow definition.  
The system allows users to navigate between different screen views and open canteen menus by scanning QR codes with their phones.

The backend provides:

- A CPEE-compatible state transition endpoint (`/update`) for QR-triggered navigation
- A menu API (`/api/menu`) using either the TUM eat-api or web scraping
- A health check endpoint (`/health`)

The repository also includes:

- A display page with QR-based interaction (`cpee-qr.html` + `cpee-qr.css`)
- A simple callback forwarding script (`send.php`)
- A CPEE process definition (`mensa cpee.xml`) for workflow control

---

## Features

- QR-driven screen navigation: `intro -> list -> menu`
- CPEE-compatible workflow state transitions
- Configurable data source: eat-api (default) or web scraping (worker threads)
- Basic price formatting and label display
- Simple caching to avoid repeated requests for the same day
- Compatible with CPEE callback payloads from `cpee-qr.html`
- Frontend inactivity handling for automatic return to the main screen
- Global CPEE timeout: after **6 minutes**, the whole process is terminated automatically

---

## Tech Stack

- Node.js + Express
- node-fetch v2
- cheerio (HTML parsing for scraping)
- worker_threads (background scraping)
- Frontend: HTML, CSS, jQuery, qrcode.js
- PHP (`send.php`)
- CPEE

---

## Project Structure

- `app.js`: main backend entry (API and CPEE state machine support)
- `scrape-worker.js`: worker for scraping menu pages
- `cpee-qr.html`: display page (QR control + menu rendering)
- `cpee-qr.css`: styles for the display page
- `send.php`: callback proxy (for forwarding QR actions to CPEE)
- `mensa cpee.xml`: CPEE process/state machine definition
- `package.json`: dependency configuration

---

## System Overview

This project consists of four main parts:

### 1. Backend (`app.js`)

The backend handles:

- `/health` for checking whether the server is running
- `/update` for state transitions triggered by CPEE / QR actions
- `/api/menu` for loading canteen menu data

It also decides whether menu data is fetched from:

- the TUM eat-api
- or a scraping source

### 2. Frontend Display (`cpee-qr.html` + `cpee-qr.css`)

The display page is shown on the main screen.  
Depending on the state, it renders:

- an intro screen
- a canteen list
- a selected menu view

It also generates QR codes for user interaction.

### 3. Callback Proxy (`send.php`)

`send.php` forwards QR-triggered actions to the callback URL expected by CPEE.

### 4. CPEE Workflow (`mensa cpee.xml`)

The XML file defines the workflow logic in CPEE.  
It controls:

- frame initialization
- screen switching
- state transitions
- callback handling
- timeout and abort behavior

It also defines that after **6 minutes**, the full CPEE process is stopped automatically.

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

Notes:

- Dependencies are defined in `package.json`
- Running `npm install` will install all required packages such as `express`, `cheerio`, `node-fetch`, etc.
- `worker_threads` is built into Node.js and does not need installation

---

### 2. Run the server

```bash
node app.js
```

Local backend address:

```text
http://localhost:9002
```

---

## Deployment and Endpoints

This system involves three types of endpoints:

### 1. Local Backend (Development)

```text
http://localhost:9002
```

This is the local Node.js backend providing:

- `/health`
- `/update`
- `/api/menu`

---

### 2. Deployed Backend (University Server)

When deployed on the TUM server, the backend is accessed via the port proxy:

```text
https://lehre.bpm.in.tum.de/ports/9002/
```

Example:

```text
https://lehre.bpm.in.tum.de/ports/9002/api/menu?canteen=garching
```

---

### 3. CPEE Frame Endpoint

```text
https://cpee.org/out/frames/dinghao/
```

This endpoint is **not part of this backend**.

It is used by CPEE to:

- render UI frames
- display the screen
- receive updates from the workflow

This project communicates with CPEE via `/update` and callback mechanisms.

Important:

- This URL only works after the CPEE instance is started and the `init` call has run.
- Opening the frame URL directly before process start may return `404 Not Found`.

---

## How the System Works

The general workflow is:

1. The CPEE process starts.
2. CPEE initializes the frame.
3. The display page opens in a specific state (`intro`, `list`, or `menu`).
4. The page generates QR codes for possible actions.
5. A user scans a QR code.
6. The QR action is sent through `send.php` to the CPEE callback.
7. CPEE updates the process state.
8. The display is reloaded with the new view.
9. If the new state is a menu view, the frontend requests menu data from `/api/menu`.
10. The backend returns the menu, and the frontend renders it.

In addition, the XML workflow contains a **global 6-minute timeout**.  
If the process reaches this limit, the whole workflow is terminated and all running parts of the system stop.

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

- `state`
- `event`
- `canteen`

Returns the updated `state` and `canteen` for further transitions.

Supported events (current implementation):

- `show-list`
- `back-main`
- `back-list`
- `exit`
- `show-menu` + `canteen`
- `show-menu-garching`
- `show-menu-arcis`
- `show-menu-leopold`
- `show-menu-boltzmann`

Example requests:

```text
state=list&event=show-menu&canteen=garching
state=list&event=show-menu-garching
state=list&event=show-menu-boltzmann
```

Example response:

```json
{ "state": "menu", "canteen": "garching" }
```

State transition logic is implemented in `app.js`.

---

### GET /api/menu

Fetch menu data.

Example:

```text
/api/menu?canteen=garching&date=YYYY-MM-DD
```

Parameters:

- `canteen` (required)
- `date` (optional, defaults to today)

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

- `400`: missing `canteen`
- `404`: no menu for the given date
- `502`: scraping failed

---

## Menu Data Source Configuration

Menu sources are configured in `getCanteenSource` in `app.js`.

- `type: 'api'`: fetch from eat-api
- `type: 'scrape'`: scrape from a website

Current canteen setup:

- `garching` -> `api`
- `arcis` -> `api`
- `leopold` -> `api`
- `loth` -> `api`
- `Boltzmann` -> `scrape`

Current scrape source:

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

- `?view=intro`: main screen
- `?view=list`: canteen list
- `?view=menu&canteen=garching`: menu view

The page reads a callback URL from `window.name` or `?cb=` and generates QR codes accordingly.  
QR actions are sent via `send.php` to the CPEE backend.

List-screen QR actions currently emitted by the frontend:

- `show-menu-garching`
- `show-menu-arcis`
- `show-menu-leopold`
- `show-menu-boltzmann`
- `back-main`
- `exit`

Menu-screen QR actions:

- `back-list`
- `back-main`

Menu data is fetched from:

```text
https://lehre.bpm.in.tum.de/ports/9002/api/menu?canteen=xxx
```

For local testing, replace this with:

```text
http://localhost:9002/api/menu?canteen=xxx
```

The frontend also contains an inactivity timeout.  
After a period without interaction, the system returns to the main screen automatically.

---

## send.php

`send.php` is a simple proxy script:

- Receives `info` and `cb` parameters
- Sends `info` to `cb` using a PUT request
- Outputs the response status and content

It is used to forward QR-triggered actions to the CPEE system.

---

## mensa cpee.xml

`mensa cpee.xml` is the workflow definition used in CPEE.

It is responsible for:

- initializing the CPEE frame
- deciding which screen should be displayed
- handling QR callback results
- updating process variables such as current state and selected canteen
- controlling loops, timeout behavior, and abort logic

The process starts by creating the frame and entering a loop until the state becomes `abort`.

Inside the workflow, different states are rendered, for example:

- `intro`
- `list`
- `menu_arcis`
- `menu_garching`
- `menu_leopold`
- `menu_boltzmann`

The XML also contains timeout behavior.  
If the process is inactive for too long, timeout handling is triggered.  
In addition, the workflow has a **global runtime limit of 6 minutes**. After 6 minutes, the entire CPEE process terminates, which means all workflow-controlled activities stop and the interactive session ends.

So the XML connects all parts of the project:

- frontend display
- backend update logic
- QR callback flow
- workflow state changes
- timeout and process termination

---

## Common Issues

1. CPEE frame URL shows 404  
   The process is not started yet, or `init` has not created the frame. Start/restart the CPEE instance first.

2. No menu found in eat-api  
   This may happen on weekends or holidays (returns 404).

3. Scraping returns no data  
   The target website structure may have changed; update selectors in `scrape-worker.js`.

4. Changing the port  
   Modify the `PORT` constant in `app.js`.

5. Intro works, list/menu becomes blank  
   Check whether:

   - the CPEE process timed out
   - the callback URL is still valid
   - the 6-minute process limit has already been reached
   - the menu API returned empty data

---

## Development Notes

- Add more canteens by extending `getCanteenSource` and `mapCanteenToEatApiKey`
- Consider better caching or scheduled updates for scraping sources
- Improve error handling for empty menus or scraping failures
- Extend the UI with allergens, more labels, or multilingual support

---

## License

No license file is currently included.  
This project is intended for academic and internal use.
