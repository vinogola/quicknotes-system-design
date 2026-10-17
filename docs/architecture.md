# QuickNotes Architecture

QuickNotes is moving from a browser-only app to an online service for 1 million users. This document sets out the requirements, the expected load, the architecture and the main trade-offs.

## Requirements

### Functional

- Users can register and log in.
- Users can create, read, update and delete their own notes.
- Notes have a category and optional tags.
- Users can list, filter and search their notes.
- Notes are saved on the server, so they are available from any device.

### Non-functional

- **Availability:** 99.9% uptime, with no single failure taking the service down.
- **Speed:** 95% of requests answered in under 300 ms.
- **Scale:** comfortable at 1 million users, with room to grow to 10 million.
- **Durability:** a saved note is never lost (replication and daily backups).
- **Security:** HTTPS everywhere, hashed passwords, token authentication, and every note checked against its owner.
- **Consistency:** a user sees their own note straight after saving it.

## Load estimate

Assumptions: 1,000,000 registered users, 20% active on a given day, each active user lists their notes 20 times a day and creates 5 notes a day, a note takes about 1 KB, and peak traffic is 5 times the average. Indexes and tags roughly double the storage.

| Measure | Working | Result |
|---|---|---|
| Daily active users | 1,000,000 x 20% | 200,000 |
| Reads per day | 200,000 x 20 | 4,000,000 |
| Reads per second (average) | 4,000,000 / 86,400 | about 46 |
| Reads per second (peak) | 46 x 5 | about 230 |
| Writes per day | 200,000 x 5 | 1,000,000 |
| Writes per second (average) | 1,000,000 / 86,400 | about 12 |
| Writes per second (peak) | 12 x 5 | about 58 |
| New notes per year | 1,000,000 x 365 | 365 million |
| **Storage per year** | 365 million x 1 KB x 2 for indexes | **about 730 GB** |

Reads outnumber writes about 4 to 1, so the design favours fast reads. These numbers are modest: one well-tuned database could carry them today. The cache and read replica are there for speed, for availability and for headroom to grow, not because the first million users need them.

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

Every app server talks to the cache, the primary database, the read replica and the queue.

## What each component does

- **Client:** shows the notes and sends API requests with the user's token.
- **DNS:** turns the QuickNotes domain name into the address of the CDN and the load balancer, so users can find the service.
- **CDN:** serves the static files (HTML, CSS, JavaScript) from servers near the user, so pages load fast and our servers don't handle them.
- **Load balancer:** spreads requests across the app servers and stops sending traffic to one that has failed, so no single server is overloaded or a single point of failure.
- **App servers:** run the API code (login, validation, notes), and they keep no state, so we can add more whenever traffic grows.
- **Cache:** keeps recent note lists in memory, so repeated reads skip the database and come back quickly.
- **Primary database:** stores users, notes and tags, and takes every write, so there is one reliable source of truth.
- **Read replica:** holds a live copy of the primary and answers read queries, so reads don't slow down writes and a copy exists if the primary fails.
- **Queue:** holds background jobs such as updating the search index and sending reminder emails, so a request can finish without waiting for slow work.
- **Worker:** takes jobs from the queue and does them, so the app servers stay free to answer users.

## Request flows

### GET /notes

1. The client sends `GET /notes` with its token. The request goes through the load balancer to an app server.
2. The app server checks the token. If it is missing or invalid, it replies 401.
3. The app server looks in the cache for this user's list (the key includes the user id and the query parameters).
4. If the cache has it, the server returns it with 200.
5. If not, the server runs the query on the read replica, stores the result in the cache for 60 seconds, and returns it with 200.

### POST /notes

1. The client sends `POST /notes` with its token and the note in the body. The request goes through the load balancer to an app server.
2. The app server checks the token (401 if it fails) and validates the body. A missing title or one over 100 characters gets a 400.
3. The app server writes the note and its tags to the primary database in one transaction.
4. The server deletes this user's cached note lists, so the next read is fresh.
5. The server puts a job on the queue, for example "update the search index for note 42".
6. The server replies 201 with the new note, without waiting for the job.
7. A worker picks up the job and does it. The primary copies the new note to the replica.

## Trade-offs

- **Cache: speed against freshness.** The cache makes repeated reads fast and protects the database, but a cached list can be up to 60 seconds old. We clear a user's cache entries whenever they write, so they see their own changes at once. Other devices of the same user are covered the same way, because the cache key belongs to the user.
- **Read replica: read scale against consistency.** The replica takes the read load, but it copies from the primary with a short delay, so a read can miss a note saved a moment ago. The cache clearing and a short read-from-primary window after a write cover this case.
- **Queue: fast replies against delayed work.** Background jobs keep requests quick and absorb spikes, but a new note can take a few seconds to show up in search. It also adds two more parts to run and monitor.
- **Single primary database: simplicity against write scale.** One primary is easy to reason about and handles 58 writes per second easily. If writes ever outgrew it, we would need to split the data across several databases, which is much harder, so we accept the limit for now.

## Avoiding single points of failure

- **App servers:** at least two behind the load balancer, and they keep no state, so any one of them can fail without loss.
- **Load balancer:** an active and a standby, so the standby takes over if the active one fails.
- **Database:** the read replica holds a current copy and can be promoted to primary if the primary fails. Daily backups, tested by restoring them, cover the worst case.
- **Cache:** if it fails, requests fall back to the read replica. They are slower, but the service keeps working.
- **Queue and workers:** jobs are stored on disk until a worker finishes them, so a crashed worker loses nothing, and more workers can be started.
- **DNS and CDN:** run by providers that already spread across many locations.
