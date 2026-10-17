# QuickNotes Architecture

The design for taking QuickNotes from a browser-only app to an online service for 1 million users.

## Requirements

**Functional:** register and log in; create, read, update and delete your own notes; categories and tags; list, filter and search; notes saved on the server and available on any device.

**Non-functional:** 99.9% availability; 95% of requests under 300 ms; comfortable at 1 million users with room for 10 million; no lost notes (replication, daily backups); HTTPS, hashed passwords, token authentication and an owner check on every note; a user sees their own note straight after saving it.

## Load estimate

Assumptions: 1,000,000 users, 20% active each day, each active user lists notes 20 times and creates 5 notes a day, a note takes about 1 KB (indexes and tags double that), and peak is 5 times average.

| Measure | Working | Result |
|---|---|---|
| Daily active users | 1,000,000 x 20% | 200,000 |
| Reads per second | 200,000 x 20 / 86,400 | about 46 average, 230 peak |
| Writes per second | 200,000 x 5 / 86,400 | about 12 average, 58 peak |
| **Storage per year** | 200,000 x 5 x 365 x 1 KB x 2 | **about 730 GB** |

Reads outnumber writes about 4 to 1, so the design favours fast reads. One tuned database could carry these numbers today. The cache and replica are for speed, availability and room to grow.

## Architecture diagram

```
        Client (browser or phone)
          |                  |
          | name lookup      | static files
          v                  v
       +-----+            +-----+
       | DNS |            | CDN |
       +-----+            +-----+
          |
          | API requests (HTTPS)
          v
 +--------------------+
 |   Load balancer    |   (active + standby)
 +--------------------+
      |          |
      v          v
 +-----------+ +-----------+
 | App srv 1 | | App srv 2 |   more can be added
 +-----------+ +-----------+
      |  \          /  |  \
      |   \        /   |   \
      v    v      v    v    v
  +-------+  +---------+  +-------+     +--------+
  | Cache |  | Primary |  | Queue |---->| Worker |
  +-------+  |   DB    |  +-------+     +--------+
             +---------+
                 |  replication
                 v
             +---------+
             |  Read   |   reads go here when the cache misses
             | replica |
             +---------+
```

Every app server uses the cache, both databases and the queue.

## What each component does

- **Client:** shows the notes and sends API requests with the user's token.
- **DNS:** turns the QuickNotes domain name into the address of the CDN and load balancer, so users can find us.
- **CDN:** serves the static files (HTML, CSS, JavaScript) from servers near the user, so pages load fast.
- **Load balancer:** spreads requests across the app servers and skips any that has failed, so none is overloaded.
- **App servers:** run the API code, and because they keep no state, we add more when traffic grows.
- **Cache:** keeps recent note lists in memory, so repeated reads skip the database.
- **Primary database:** stores users, notes and tags and takes every write, so there is one source of truth.
- **Read replica:** a live copy of the primary that answers reads, so they don't slow down writes.
- **Queue:** holds background jobs such as updating the search index, so a request can finish without waiting for slow work.
- **Worker:** takes jobs from the queue and does them, so the app servers stay free for users.

## Request flows

**GET /notes**

1. The client sends the request with its token through the load balancer to an app server.
2. The server checks the token and replies 401 if it fails.
3. It looks in the cache for this user's list.
4. On a hit, it returns the list with 200.
5. On a miss, it queries the read replica, caches the result for 60 seconds and returns 200.

**POST /notes**

1. The client sends the request with its token and the note through the load balancer to an app server.
2. The server checks the token (401) and the body, and replies 400 if the title is missing or over 100 characters.
3. It writes the note and its tags to the primary database in one transaction.
4. It deletes this user's cached lists, so the next read is fresh.
5. It puts a job on the queue, for example "update the search index for note 42", and replies 201 with the new note.
6. A worker later does the job, and the primary copies the note to the replica.

## Trade-offs

- **Cache: speed against freshness.** Cached lists can be up to 60 seconds old. We clear a user's entries on every write, so they see their own changes at once.
- **Read replica: read scale against consistency.** The replica lags the primary slightly, so a read can miss a note saved a moment ago. Clearing the cache and reading from the primary briefly after a write covers it.
- **Queue: fast replies against delayed work.** Requests stay quick, but a new note can take seconds to show up in search, and the queue and workers are two more parts to run.
- **Single primary: simplicity against write scale.** One primary is easy to reason about and handles 58 writes a second easily. Beyond that we would have to split the data, which is much harder.

## Avoiding single points of failure

- **App servers:** at least two behind the load balancer, with no state, so one can fail without loss.
- **Load balancer:** an active and a standby that takes over.
- **Database:** the replica can be promoted if the primary fails, and daily backups, tested by restoring them, cover the worst case.
- **Cache:** if it fails, requests fall back to the replica, slower but working.
- **Queue and workers:** jobs are stored on disk until done, so a crashed worker loses nothing.
- **DNS and CDN:** run by providers that already spread across many locations.
