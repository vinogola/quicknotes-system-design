# QuickNotes System Design

QuickNotes started as a browser-only notes app. This project designs the online version for 1 million users, in two parts: a small API client that loads, creates and deletes notes on the JSONPlaceholder practice API, and three design documents for the backend team.

## Running the API client

There's nothing to install. Clone the repo, open `index.html` in a browser (double-click it, or use the VS Code Live Server extension) and click **Load notes**. You can add a note with the form and delete notes with their Delete buttons. JSONPlaceholder is a practice API, so it accepts requests but doesn't keep what you send.

## Design documents

- [API design](docs/api-design.md)
- [Data model](docs/data-model.md)
- [Architecture](docs/architecture.md)

## What I learned

- JSONPlaceholder doesn't save what you send. Every created note comes back with id 101, and deleting it still returns 200. If the page removed notes by id, deleting one of two created notes would remove both. Giving each note a local `key` fixed that.
- `fetch` only fails on a network error. A 404 or 500 comes back as a normal response, so `request()` checks `response.ok` and throws, and every call sits in `try / catch / finally` so the buttons always come back.
- The numbers decide the design. With 1 million users, reads outnumber writes about 4 to 1 and peak writes are only about 58 a second, so one primary database is enough. The cache and read replica are there for speed and availability, not raw capacity.
- An index changes the query plan. For "newest notes for one user", `EXPLAIN QUERY PLAN` shows a full table scan plus a sort, and an index on `(user_id, created_at)` removes both.
