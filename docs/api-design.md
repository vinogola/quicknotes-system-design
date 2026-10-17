# QuickNotes API Design

This is the API the backend team should build for QuickNotes. It follows REST: resources are plural nouns, the HTTP method says what to do, and an id addresses a single item. Everything is JSON over HTTPS.

- **Base URL:** `https://api.quicknotes.example/v1`
- **Authentication:** every endpoint except `POST /auth/login` needs the header `Authorization: Bearer <token>`. The token comes from the login endpoint, and each request carries it, so the server keeps no session. A user only ever sees and changes their own notes.
- **Format:** requests and responses use `Content-Type: application/json`.

## Endpoints

| Method | Path | Description | Success status |
|---|---|---|---|
| POST | `/auth/login` | Log in with an email and password and receive a token | 200 OK |
| GET | `/notes` | List the logged-in user's notes. Optional query parameters: `category`, `tag`, `search`, `page`, `limit` | 200 OK |
| GET | `/notes/{id}` | Get one note | 200 OK |
| POST | `/notes` | Create a note | 201 Created |
| PATCH | `/notes/{id}` | Update some fields of a note | 200 OK |
| DELETE | `/notes/{id}` | Delete a note | 204 No Content |
| GET | `/tags` | List all tags | 200 OK |
| PUT | `/notes/{id}/tags` | Replace the tags on a note | 200 OK |

`PATCH` is used for edits because a client usually changes one field, such as the text. `DELETE` returns 204 because there is nothing left to send back.

## Examples

### Create a note

Request:

```http
POST /v1/notes
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
Content-Type: application/json

{
  "title": "Revise HTTP methods",
  "body": "GET, POST, PUT, PATCH, DELETE",
  "category": "study",
  "tags": ["exams", "urgent"]
}
```

Response, `201 Created`:

```json
{
  "id": 42,
  "title": "Revise HTTP methods",
  "body": "GET, POST, PUT, PATCH, DELETE",
  "category": "study",
  "tags": ["exams", "urgent"],
  "createdAt": "2026-10-18T09:15:00Z"
}
```

### List notes

Request: `GET /v1/notes?category=study&page=1&limit=2`

Response, `200 OK`:

```json
{
  "data": [
    {
      "id": 42,
      "title": "Revise HTTP methods",
      "category": "study",
      "tags": ["exams", "urgent"],
      "createdAt": "2026-10-18T09:15:00Z"
    },
    {
      "id": 37,
      "title": "Read the Day 6 notes",
      "category": "study",
      "tags": [],
      "createdAt": "2026-10-17T18:02:00Z"
    }
  ],
  "page": 1,
  "limit": 2,
  "total": 5
}
```

## Error responses

Every error uses the same body shape: `{ "error": { "code": "...", "message": "..." } }`.

| Status | When it happens | Example error body |
|---|---|---|
| 400 Bad Request | The request is invalid, for example `POST /notes` with no title, or a title over 100 characters | `{ "error": { "code": "VALIDATION_ERROR", "message": "title is required" } }` |
| 401 Unauthorized | The token is missing, expired or invalid | `{ "error": { "code": "UNAUTHORIZED", "message": "Missing or invalid token" } }` |
| 403 Forbidden | The user is logged in but the note belongs to someone else, for example `DELETE /notes/42` on another user's note | `{ "error": { "code": "FORBIDDEN", "message": "You cannot change this note" } }` |
| 404 Not Found | The note or URL does not exist, for example `GET /notes/9999` | `{ "error": { "code": "NOT_FOUND", "message": "Note 9999 not found" } }` |
| 500 Internal Server Error | Something broke on the server | `{ "error": { "code": "INTERNAL_ERROR", "message": "Something went wrong. Please try again." } }` |
