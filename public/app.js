import {
  MAX_ROWS,
  buildDiscordMessage,
  cleanSingleLine,
  rememberEventName,
  utcDateTimeToUnix,
  tomorrowInUTC,
  validateSchedule
} from "./core.js";

const STORAGE_KEY = "discord-scheduler-template-utc-v1";
const PACIFIC_STORAGE_KEY = "discord-scheduler-template-v1";
const EVENT_NAMES_KEY = "discord-scheduler-event-names-v1";

const elements = {
  announcement: document.querySelector("#announcement"),
  date: document.querySelector("#schedule-date"),
  includeEveryone: document.querySelector("#include-everyone"),
  rows: document.querySelector("#schedule-rows"),
  endTime: document.querySelector("#end-time"),
  warnings: document.querySelector("#warnings"),
  preview: document.querySelector("#friendly-preview"),
  raw: document.querySelector("#raw-message"),
  count: document.querySelector("#event-count"),
  characters: document.querySelector("#character-count"),
  add: document.querySelector("#add-row"),
  save: document.querySelector("#save-template"),
  load: document.querySelector("#load-template"),
  clear: document.querySelector("#clear-schedule"),
  copy: document.querySelector("#copy-message"),
  post: document.querySelector("#post-discord"),
  webhookStatus: document.querySelector("#webhook-status"),
  toast: document.querySelector("#toast"),
  rowTemplate: document.querySelector("#row-template")
};

let webhookConfigured = false;
let toastTimer;
let previousEventNames = loadPreviousEventNames();

function loadPreviousEventNames() {
  try {
    const saved = JSON.parse(localStorage.getItem(EVENT_NAMES_KEY) ?? "[]");
    return Array.isArray(saved)
      ? saved.filter((name) => typeof name === "string").reduceRight(rememberEventName, [])
      : [];
  } catch {
    return [];
  }
}

function populatePreviousNames(select) {
  const prompt = new Option("Previous names", "");
  select.replaceChildren(prompt, ...previousEventNames.map((name) => new Option(name, name)));
  select.disabled = previousEventNames.length === 0;
}

function rememberNames(values) {
  const updated = values.reduce(rememberEventName, previousEventNames);
  if (updated.length === previousEventNames.length &&
      updated.every((name, index) => name === previousEventNames[index])) return;
  previousEventNames = updated;
  try {
    localStorage.setItem(EVENT_NAMES_KEY, JSON.stringify(previousEventNames));
  } catch {
    // Names remain available for this session if browser storage is disabled.
  }
  elements.rows.querySelectorAll(".previous-event-names").forEach(populatePreviousNames);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2200);
}

function addRow(row = { name: "", time: "", bold: false }, focus = false) {
  if (elements.rows.children.length >= MAX_ROWS) {
    showToast(`Maximum of ${MAX_ROWS} events reached`);
    return null;
  }
  const fragment = elements.rowTemplate.content.cloneNode(true);
  const node = fragment.querySelector(".schedule-row");
  const nameInput = node.querySelector(".event-name");
  const previousNames = node.querySelector(".previous-event-names");
  nameInput.value = cleanSingleLine(row.name, 100);
  populatePreviousNames(previousNames);
  nameInput.addEventListener("change", () => rememberNames([nameInput.value]));
  previousNames.addEventListener("change", () => {
    if (!previousNames.value) return;
    nameInput.value = previousNames.value;
    rememberNames([nameInput.value]);
    render();
    nameInput.focus();
  });
  node.querySelector(".event-time").value = /^\d{2}:\d{2}$/.test(row.time ?? "") ? row.time : "";
  node.querySelector(".event-bold").checked = Boolean(row.bold);
  node.querySelector(".delete-row").addEventListener("click", () => {
    node.remove();
    if (!elements.rows.children.length) addRow();
    render();
  });
  node.addEventListener("input", render);
  elements.rows.append(fragment);
  if (focus) {
    node.querySelector(".event-name").focus();
    node.scrollIntoView({ block: "nearest" });
  }
  updateAddState();
  return node;
}

function readSchedule() {
  return {
    announcement: elements.announcement.value,
    date: elements.date.value,
    includeEveryone: elements.includeEveryone.checked,
    rows: [...elements.rows.querySelectorAll(".schedule-row")].map((row) => ({
      name: row.querySelector(".event-name").value,
      time: row.querySelector(".event-time").value,
      bold: row.querySelector(".event-bold").checked
    })),
    endTime: elements.endTime.value
  };
}

function formatUTCTime(time) {
  if (!time) return "—";
  const [hour, minute] = time.split(":").map(Number);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} UTC`;
}

function updateAddState() {
  const full = elements.rows.children.length >= MAX_ROWS;
  elements.add.disabled = full;
  elements.add.title = full ? `Maximum ${MAX_ROWS} events` : "";
}

function renderPreview(schedule) {
  elements.preview.replaceChildren();
  const validRows = schedule.rows.filter((row) => row.name && row.time);
  elements.count.textContent = `${validRows.length} event${validRows.length === 1 ? "" : "s"}`;
  const entries = validRows.map((row) => ({ ...row, label: cleanSingleLine(row.name, 100) }));
  if (schedule.endTime) entries.push({ label: "End", time: schedule.endTime, bold: false });

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "preview-empty";
    empty.textContent = "Add an event to see the rundown.";
    elements.preview.append(empty);
    return;
  }
  entries.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "preview-item";
    const time = document.createElement("span");
    time.className = "preview-time";
    time.textContent = formatUTCTime(entry.time);
    const details = document.createElement("div");
    const name = document.createElement("span");
    name.className = "preview-name";
    name.textContent = entry.label;
    if (entry.bold) name.style.fontWeight = "900";
    const timestamp = document.createElement("code");
    timestamp.className = "preview-stamp";
    try {
      timestamp.textContent = `<t:${utcDateTimeToUnix(schedule.date, entry.time)}:t>`;
    } catch (error) {
      timestamp.textContent = error.message;
    }
    details.append(name, timestamp);
    item.append(time, details);
    elements.preview.append(item);
  });
}

function render() {
  const schedule = readSchedule();
  const warnings = validateSchedule(schedule);
  if (warnings.length) {
    elements.warnings.hidden = false;
    elements.warnings.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = "Check the schedule";
    const list = document.createElement("ul");
    warnings.forEach((warning) => {
      const item = document.createElement("li");
      item.textContent = warning;
      list.append(item);
    });
    elements.warnings.append(title, list);
  } else {
    elements.warnings.hidden = true;
    elements.warnings.replaceChildren();
  }

  let message = "";
  try {
    message = buildDiscordMessage(schedule);
  } catch (error) {
    message = `Cannot generate message: ${error.message}`;
  }
  elements.raw.textContent = message;
  elements.characters.textContent = `${message.length.toLocaleString()} / 2,000`;
  elements.characters.classList.toggle("over", message.length > 2000);
  elements.copy.disabled = !message || message.startsWith("Cannot generate") || warnings.length > 0;
  elements.post.disabled = !webhookConfigured || elements.copy.disabled || warnings.length > 0;
  renderPreview(schedule);
  updateAddState();
}

function applySchedule(schedule) {
  elements.announcement.value = cleanSingleLine(schedule.announcement, 240);
  elements.date.value = /^\d{4}-\d{2}-\d{2}$/.test(schedule.date ?? "") ? schedule.date : tomorrowInUTC();
  elements.includeEveryone.checked = schedule.includeEveryone !== false;
  elements.endTime.value = /^\d{2}:\d{2}$/.test(schedule.endTime ?? "") ? schedule.endTime : "";
  elements.rows.replaceChildren();
  const rows = Array.isArray(schedule.rows) && schedule.rows.length ? schedule.rows.slice(0, MAX_ROWS) : [{ name: "", time: "", bold: false }];
  rows.forEach((row) => addRow(row));
  rememberNames(rows.map((row) => row.name));
  render();
}

elements.add.addEventListener("click", () => {
  const row = addRow(undefined, true);
  if (!row) return;
  render();
  showToast("Event added");
});
[elements.announcement, elements.date, elements.includeEveryone, elements.endTime].forEach((input) => input.addEventListener("input", render));

elements.save.addEventListener("click", () => {
  const { date: _date, ...template } = readSchedule();
  rememberNames(template.rows.map((row) => row.name));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(template));
    showToast("Template saved on this device");
  } catch {
    showToast("Template could not be saved");
  }
});

elements.load.addEventListener("click", () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      showToast(localStorage.getItem(PACIFIC_STORAGE_KEY)
        ? "Old Pacific template remains saved; re-enter its times in UTC."
        : "No saved UTC template yet");
      return;
    }
    applySchedule({ ...JSON.parse(saved), date: tomorrowInUTC() });
    showToast("Template loaded for tomorrow");
  } catch {
    showToast("Saved template is invalid");
  }
});

elements.clear.addEventListener("click", () => {
  if (!confirm("Clear the current schedule? Your saved template will stay available.")) return;
  applySchedule({ announcement: "", date: tomorrowInUTC(), includeEveryone: false, rows: [{}], endTime: "" });
});

elements.copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(elements.raw.textContent);
    showToast("Discord message copied");
  } catch {
    showToast("Copy failed — select the message manually");
  }
});

elements.post.addEventListener("click", async () => {
  if (!confirm("Post this schedule to Discord now?")) return;
  elements.post.disabled = true;
  elements.post.textContent = "Posting…";
  try {
    const response = await fetch("./api/post", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: elements.raw.textContent, allowEveryone: elements.includeEveryone.checked })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Posting failed.");
    showToast("Schedule posted to Discord");
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.post.textContent = "Post to Discord";
    render();
  }
});

async function checkWebhook() {
  try {
    const response = await fetch("./api/config", { cache: "no-store" });
    if (!response.ok) throw new Error();
    webhookConfigured = Boolean((await response.json()).webhookConfigured);
  } catch {
    webhookConfigured = false;
  }
  elements.webhookStatus.textContent = webhookConfigured
    ? "Server webhook is configured. Review the schedule before posting."
    : "Webhook posting isn’t configured here. Copy to clipboard still works.";
  render();
}

applySchedule({
  announcement: "",
  date: tomorrowInUTC(),
  includeEveryone: false,
  rows: [{}],
  endTime: ""
});
checkWebhook();
