const API_URL = "https://jsonplaceholder.typicode.com/posts";

const loadButton = document.querySelector("#load-btn");
const statusMessage = document.querySelector("#status");
const notesList = document.querySelector("#notes-list");

let notes = [];

const showStatus = (message, type) => {
  statusMessage.textContent = message;
  statusMessage.className = type;
};

const setBusy = (busy) => {
  loadButton.disabled = busy;
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

    notesList.appendChild(item);
  });
};

const loadNotes = async () => {
  setBusy(true);
  showStatus("Loading notes...", "loading");

  try {
    const { data } = await request(`${API_URL}?_limit=10`);
    notes = data;
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

loadButton.addEventListener("click", loadNotes);
