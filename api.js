const API_URL = "https://jsonplaceholder.typicode.com/posts";

const loadButton = document.querySelector("#load-btn");
const noteForm = document.querySelector("#note-form");
const titleInput = document.querySelector("#title-input");
const bodyInput = document.querySelector("#body-input");
const submitButton = document.querySelector("#submit-btn");
const statusMessage = document.querySelector("#status");
const notesList = document.querySelector("#notes-list");

// JSONPlaceholder doesn't store what we send, and every created note comes back with id 101.
// So the page keeps its own array: the server call decides success or failure, and the array
// decides what is shown. Each note also gets a local key, because two created notes share
// id 101 and removing one by id would remove both.
let notes = [];
let nextKey = 1;

const showStatus = (message, type) => {
  statusMessage.textContent = message;
  statusMessage.className = type;
};

const setBusy = (busy) => {
  loadButton.disabled = busy;
  submitButton.disabled = busy;
  notesList.querySelectorAll("button").forEach((button) => {
    button.disabled = busy;
  });
};

// Returns { status, data }. Throws on a network failure and on any non-2xx status.
const request = async (url, options) => {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
};

const render = () => {
  notesList.replaceChildren();

  if (notes.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No notes to show.";
    notesList.appendChild(empty);
    return;
  }

  notes.forEach((note) => {
    const item = document.createElement("li");

    const title = document.createElement("h3");
    title.textContent = note.title;
    item.appendChild(title);

    if (note.body) {
      const body = document.createElement("p");
      body.textContent = note.body;
      item.appendChild(body);
    }

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => deleteNote(note));
    item.appendChild(deleteButton);

    notesList.appendChild(item);
  });
};

const loadNotes = async () => {
  setBusy(true);
  showStatus("Loading notes...", "loading");

  try {
    const { data } = await request(`${API_URL}?_limit=10`);
    notes = data.map((note) => ({ ...note, key: nextKey++ }));
    render();

    const count = notes.length;
    showStatus(
      count === 0
        ? "The server returned no notes."
        : `Loaded ${count} ${count === 1 ? "note" : "notes"} from the server.`,
      "success",
    );
  } catch {
    showStatus("Could not load notes. Please try again.", "error");
  } finally {
    setBusy(false);
  }
};

const createNote = async (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (title === "") {
    showStatus("Please enter a title.", "error");
    return;
  }

  if (title.length > 100) {
    showStatus("The title must be 100 characters or fewer.", "error");
    return;
  }

  setBusy(true);
  showStatus("Creating note...", "loading");

  try {
    const { status, data } = await request(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, userId: 1 }),
    });

    notes.unshift({ ...data, key: nextKey++ });
    render();
    showStatus(`Note created (status ${status}, id ${data.id}).`, "success");
    noteForm.reset();
  } catch {
    showStatus("Could not create the note. Please try again.", "error");
  } finally {
    setBusy(false);
  }
};

const deleteNote = async (note) => {
  setBusy(true);
  showStatus("Deleting note...", "loading");

  try {
    await request(`${API_URL}/${note.id}`, { method: "DELETE" });

    notes = notes.filter((item) => item.key !== note.key);
    render();
    showStatus("Note deleted.", "success");
  } catch {
    showStatus("Could not delete the note. Please try again.", "error");
  } finally {
    setBusy(false);
  }
};

loadButton.addEventListener("click", loadNotes);
noteForm.addEventListener("submit", createNote);
