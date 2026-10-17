# QuickNotes Data Model

The database behind the API in `api-design.md`. It has four entities: users, notes, tags, and the join table `note_tags`.

## Entities

### users

| Column | Type | Key | Notes |
|---|---|---|---|
| id | INTEGER | Primary key | |
| name | TEXT | | Required |
| email | TEXT | | Required, unique |
| password_hash | TEXT | | Required. Passwords are never stored as plain text |
| created_at | TEXT | | Filled in automatically |

### notes

| Column | Type | Key | Notes |
|---|---|---|---|
| id | INTEGER | Primary key | |
| user_id | INTEGER | Foreign key to `users.id` | Required. Deleting a user deletes their notes |
| title | TEXT | | Required, at most 100 characters |
| body | TEXT | | Optional |
| category | TEXT | | Required, default `personal` |
| created_at | TEXT | | Filled in automatically |

### tags

| Column | Type | Key | Notes |
|---|---|---|---|
| id | INTEGER | Primary key | |
| name | TEXT | | Required, unique |

### note_tags

| Column | Type | Key | Notes |
|---|---|---|---|
| note_id | INTEGER | Foreign key to `notes.id`, part of the primary key | |
| tag_id | INTEGER | Foreign key to `tags.id`, part of the primary key | |

The primary key is the pair (`note_id`, `tag_id`), so a note can't carry the same tag twice.

## Relationships

- **users to notes is one-to-many.** One user has many notes, and each note belongs to exactly one user. The foreign key `notes.user_id` sits on the "many" side.
- **notes to tags is many-to-many.** A note can have several tags (exams, urgent), and a tag can be on many notes. A table can't hold a list in one column, so the join table `note_tags` stores one row for each note and tag pair. Each of its two foreign keys makes it one-to-many from `notes` and from `tags`.

## CREATE TABLE statements

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL CHECK (length(title) <= 100),
  body TEXT,
  category TEXT NOT NULL DEFAULT 'personal',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE note_tags (
  note_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes (id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
);
```

## Example queries

The most common request, `GET /notes`: the newest 20 notes for one user.

```sql
SELECT id, title, category, created_at
FROM notes
WHERE user_id = 1
ORDER BY created_at DESC
LIMIT 20;
```

Notes carrying a given tag, which joins three tables (`GET /notes?tag=urgent`):

```sql
SELECT n.title, t.name AS tag
FROM notes n
JOIN note_tags nt ON nt.note_id = n.id
JOIN tags t ON t.id = nt.tag_id
WHERE n.user_id = 1
  AND t.name = 'urgent';
```

How many notes a user has in each category:

```sql
SELECT category, COUNT(*) AS total
FROM notes
WHERE user_id = 1
GROUP BY category;
```

## Index

```sql
CREATE INDEX idx_notes_user_created ON notes (user_id, created_at);
```

Almost every request lists one user's notes, newest first. Without this index, SQLite scans the whole `notes` table and then sorts the matches (`EXPLAIN QUERY PLAN` shows a scan plus a temporary sort). With it, the database jumps straight to that user's rows, already ordered by `created_at`, so the scan and the sort both disappear. The trade-off is slightly slower writes and some extra storage, which is acceptable because notes are read far more often than they are written.

## SQL or NoSQL

I'd choose SQL. The data is structured and has clear relationships: users own notes, and notes and tags are linked many-to-many. I want the database itself to enforce the rules (unique emails, a 100-character title limit, no note without a user, no duplicate tag on a note), and I want joins for queries like "all of my notes tagged urgent". A document database would embed each user's notes and tags inside one document, which makes tag changes and cross-user queries awkward and spreads the rules into application code. NoSQL would become attractive if notes grew into very different shapes, such as drawings and checklists, or if the service needed to spread across many servers. For one million users and simple text notes, a relational database handles the load, and replicas cover the read side.
