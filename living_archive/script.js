const list = document.getElementById("archive-list");
const panel = document.getElementById("doc-panel");
const panelBody = document.getElementById("doc-body");
const viewAll = document.getElementById("view-all");
const allLayer = document.getElementById("all-weeks-layer");
const allWeeks = document.getElementById("all-weeks");
const allScroll = document.getElementById("all-weeks-scroll");

const LAYOUT_KEY = "living-archive-layout";

let weeks = [];
let lastTrigger = null;
let allRendered = false;
let edits = {};
let uploads = [];
let dragBlockId = "";

function init() {
  edits = loadEdits();
  viewAll.addEventListener("click", onViewAllClick);
  panel.addEventListener("click", onPanelClick);
  allLayer.addEventListener("click", onAllLayerClick);
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onKeydown);
  Promise.all([loadArchive(), loadUploads()]).catch(() => {});
}

async function loadArchive() {
  try {
    const response = await fetch("archive.json");
    if (!response.ok) {
      throw new Error("Archive request failed");
    }
    const data = await response.json();
    weeks = Array.isArray(data.weeks) ? data.weeks : [];
    allRendered = false;
    renderList(weeks);
  } catch (error) {
    list.textContent = "Archive could not be loaded.";
  }
}

function renderList(entries) {
  list.replaceChildren();

  entries.forEach((week) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "date";
    button.dataset.week = week.id;
    button.textContent = `${week.week} | ${week.date}`;
    button.addEventListener("click", () => openWeek(week, button));
    list.append(button);
  });
}

function openWeek(week, trigger) {
  if (isAllOpen()) {
    closeAll({ restoreFocus: false });
  }

  const wasOpen = panel.classList.contains("is-open");
  lastTrigger = trigger;
  renderPanel(week);
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  panel.removeAttribute("inert");
  panel.setAttribute(
    "aria-label",
    week.title ? `${week.week}, ${week.title}` : `${week.week}, ${week.date}`
  );
  panel.scrollTop = 0;

  list.querySelectorAll("[data-week]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.week === week.id);
  });

  if (!wasOpen) {
    panel.querySelector("[data-close]")?.focus();
  }
}

function closePanel({ restoreFocus = true } = {}) {
  if (!panel.classList.contains("is-open")) {
    return;
  }

  pauseVideos(panel);
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
  panel.setAttribute("inert", "");
  list.querySelectorAll(".is-active").forEach((button) => {
    button.classList.remove("is-active");
  });

  if (restoreFocus && lastTrigger) {
    lastTrigger.focus();
  }
}

function openAll() {
  if (panel.classList.contains("is-open")) {
    closePanel({ restoreFocus: false });
  }

  if (!allRendered && weeks.length) {
    renderAll(weeks);
    allRendered = true;
  }

  allLayer.classList.add("is-open");
  allLayer.setAttribute("aria-hidden", "false");
  allLayer.removeAttribute("inert");
  allScroll.scrollTop = 0;
  allLayer.querySelector("[data-close-all]")?.focus();
}

function closeAll({ restoreFocus = true } = {}) {
  if (!isAllOpen()) {
    return;
  }

  pauseVideos(allScroll);
  allLayer.classList.remove("is-open");
  allLayer.setAttribute("aria-hidden", "true");
  allLayer.setAttribute("inert", "");

  if (restoreFocus) {
    viewAll.focus();
  }
}

function isAllOpen() {
  return allLayer.classList.contains("is-open");
}

function renderPanel(week, options = {}) {
  const scroll = panel.scrollTop;
  revokeObjectUrls(panelBody);
  panelBody.replaceChildren();

  const bar = element("div", "doc-bar");
  const kicker = element("p", "doc-kicker");
  kicker.textContent = `${week.week} | ${week.date}`;

  const close = element("button", "doc-close");
  close.type = "button";
  close.dataset.close = "true";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";
  bar.append(kicker, close);
  panelBody.append(bar);
  panelBody.append(renderWeekDocument(week, { variant: "panel", preload: "metadata" }));

  if (options.keepScroll) {
    panel.scrollTop = scroll;
  }
  if (options.focusId) {
    const blockNode = panel.querySelector(`[data-block-id="${CSS.escape(options.focusId)}"]`);
    const preferred = blockNode?.querySelector(`[data-move="${options.focusMove}"]:not(:disabled)`);
    (preferred || blockNode?.querySelector("[data-move]:not(:disabled)"))?.focus();
  }
}

function renderAll(entries) {
  revokeObjectUrls(allScroll);
  allScroll.replaceChildren();

  entries.forEach((week) => {
    const section = element("section", "all-week");
    section.append(renderWeekDocument(week, { variant: "timeline", preload: "metadata" }));
    allScroll.append(section);
  });
}

function renderWeekDocument(week, options) {
  const fragment = document.createDocumentFragment();
  const variant = options.variant;
  const blocks = blocksFor(week);

  if (variant === "timeline") {
    const kicker = element("p", "doc-kicker");
    kicker.textContent = `${week.week} | ${week.date}`;
    fragment.append(kicker);
    fragment.append(element("div", "all-week-rule"));
  }

  if (variant === "panel" && blocks.length === 0) {
    const empty = element("p", "doc-copy");
    empty.textContent = "This week has not been documented yet.";
    fragment.append(empty);
  }

  blocks.forEach((block, index) => {
    fragment.append(renderBlock(block, index, blocks.length, week, options));
  });

  fragment.append(renderFeedback(week, options));
  return fragment;
}

function renderBlock(block, index, total, week, options) {
  const section = element("section", "doc-block");
  section.dataset.blockId = block.id;

  if (options.variant === "panel" && total > 1) {
    section.append(renderBlockBar(block, index, total, week));
    section.addEventListener("dragover", (event) => {
      event.preventDefault();
      section.classList.add("is-drop");
    });
    section.addEventListener("dragleave", () => {
      section.classList.remove("is-drop");
    });
    section.addEventListener("drop", (event) => {
      event.preventDefault();
      section.classList.remove("is-drop");
      placeBlock(week, event.dataTransfer.getData("text/plain") || dragBlockId, block.id);
    });
  }

  if (block.kind === "text") {
    const tag = block.variant === "title" ? "h2" : block.variant === "process-title" ? "h3" : "p";
    const className = block.variant === "title"
      ? "doc-title"
      : block.variant === "process-title"
        ? "doc-process-title"
        : block.variant === "caption"
          ? "doc-caption"
          : "doc-copy";
    const node = element(tag, className);
    node.textContent = block.text;
    section.append(node);
    return section;
  }

  section.append(renderMedia(block, options));
  if (block.caption) {
    const caption = element("p", "doc-caption");
    caption.textContent = block.caption;
    section.append(caption);
  }
  return section;
}

function renderBlockBar(block, index, total, week) {
  const bar = element("div", "doc-block-bar");
  const handle = element("span", "doc-handle");
  handle.textContent = "↕";
  handle.draggable = true;
  handle.setAttribute("aria-hidden", "true");
  handle.addEventListener("dragstart", (event) => {
    dragBlockId = block.id;
    event.dataTransfer.setData("text/plain", block.id);
    event.dataTransfer.effectAllowed = "move";
    handle.closest(".doc-block")?.classList.add("is-dragging");
  });
  handle.addEventListener("dragend", () => {
    dragBlockId = "";
    handle.closest(".doc-block")?.classList.remove("is-dragging");
  });

  const up = moveButton("Move up", -1, index === 0);
  const down = moveButton("Move down", 1, index === total - 1);
  up.addEventListener("click", () => moveBlock(week, block.id, -1));
  down.addEventListener("click", () => moveBlock(week, block.id, 1));
  bar.append(handle, up, down);
  return bar;
}

function moveButton(label, direction, disabled) {
  const button = element("button", "doc-inline");
  button.type = "button";
  button.dataset.move = String(direction);
  button.textContent = direction < 0 ? "↑" : "↓";
  button.setAttribute("aria-label", label);
  button.disabled = disabled;
  return button;
}

function renderFeedback(week, options) {
  const section = element("section", "doc-feedback");
  const heading = element("h2", "doc-feedback-title");
  heading.textContent = "Feedback & next steps";
  section.append(heading);

  const notes = feedbackFor(week);
  const editable = options.variant === "panel";
  const uploaded = uploadsFor(week);
  const hasNotes = notes.text || notes.nextSteps || notes.media.length || uploaded.length;

  if (editable) {
    section.append(renderFeedbackField(week, "feedback", "Feedback", notes.text));
    section.append(renderFeedbackField(week, "nextSteps", "Next steps", notes.nextSteps));
  } else if (notes.text) {
    section.append(readOnlyNote("Feedback", notes.text));
  }

  if (!editable && notes.nextSteps) {
    section.append(readOnlyNote("Next steps", notes.nextSteps));
  }

  if (notes.media.length || uploaded.length) {
    const mediaWrap = element("div", "doc-feedback-media");
    notes.media.forEach((item) => {
      if (!(item.src && (item.type === "image" || item.type === "video"))) {
        return;
      }
      const figure = element("figure", "doc-upload");
      figure.append(renderMedia(item, options));
      if (item.caption) {
        const caption = element("p", "doc-caption");
        caption.textContent = item.caption;
        figure.append(caption);
      }
      mediaWrap.append(figure);
    });
    uploaded.forEach((item) => {
      const figure = element("figure", "doc-upload");
      const url = URL.createObjectURL(item.blob);
      figure.append(renderMedia({
        type: item.type,
        src: url,
        caption: item.name,
        objectUrl: true
      }, options));
      if (editable) {
        const remove = element("button", "doc-inline");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.setAttribute("aria-label", `Remove ${item.name}`);
        remove.addEventListener("click", () => removeUpload(week, item.id));
        figure.append(remove);
      }
      mediaWrap.append(figure);
    });
    section.append(mediaWrap);
  }

  if (editable) {
    const add = element("label", "doc-upload-label");
    add.textContent = "Add image or video";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.multiple = true;
    input.className = "doc-file";
    input.addEventListener("change", () => {
      const files = [...input.files];
      input.value = "";
      addUploads(week, files);
    });
    add.append(input);
    section.append(add);
  } else if (!hasNotes) {
    const empty = element("p", "doc-copy");
    empty.textContent = "Nothing recorded yet.";
    section.append(empty);
  }

  return section;
}

function renderFeedbackField(week, key, label, value) {
  const wrap = element("label", "doc-field");
  const name = element("span", "doc-kicker");
  name.textContent = label;
  const input = document.createElement("textarea");
  input.className = "doc-input";
  input.rows = 3;
  input.value = value;
  input.addEventListener("input", () => {
    saveField(week.id, key, input.value);
  });
  wrap.append(name, input);
  return wrap;
}

function readOnlyNote(label, value) {
  const wrap = element("div", "doc-field");
  const name = element("span", "doc-kicker");
  name.textContent = label;
  const copy = element("p", "doc-copy");
  copy.textContent = value;
  wrap.append(name, copy);
  return wrap;
}

function renderMedia(item, options) {
  const url = item.objectUrl ? item.src : mediaSrc(item.src);

  if (item.kind === "video" || item.type === "video") {
    const video = document.createElement("video");
    video.className = "doc-media";
    video.controls = true;
    video.playsInline = true;
    video.autoplay = false;
    video.preload = options.preload || "metadata";
    video.src = url;
    if (item.objectUrl) {
      video.dataset.objectUrl = url;
    }
    return video;
  }

  const image = document.createElement("img");
  image.className = "doc-media";
  image.alt = item.caption || item.text || "";
  image.decoding = "async";
  if (options.variant === "timeline" && !item.objectUrl) {
    image.loading = "lazy";
  }
  image.src = url;
  if (item.objectUrl) {
    image.dataset.objectUrl = url;
  }
  return image;
}

function blocksFor(week) {
  const base = Array.isArray(week.blocks) && week.blocks.length
    ? explicitBlocks(week.blocks)
    : legacyBlocks(week);
  const order = edits[week.id]?.order;
  if (!Array.isArray(order) || order.length === 0) {
    return base;
  }

  const remaining = new Map(base.map((block) => [block.id, block]));
  const ordered = [];
  order.forEach((id) => {
    const block = remaining.get(id);
    if (!block) {
      return;
    }
    ordered.push(block);
    remaining.delete(id);
  });
  remaining.forEach((block) => ordered.push(block));
  return ordered;
}

function legacyBlocks(week) {
  const blocks = [];
  if (week.title) {
    blocks.push({ id: "title", kind: "text", variant: "title", text: week.title });
  }
  if (week.description) {
    blocks.push({ id: "description", kind: "text", variant: "copy", text: week.description });
  }

  const process = Array.isArray(week.process) ? week.process : [];
  process.forEach((item, index) => {
    const id = item.id || `process-${index}`;
    if (item.type === "text" || (item.text && !item.src)) {
      blocks.push({
        id,
        kind: "text",
        variant: item.variant || "copy",
        text: item.text || ""
      });
      return;
    }
    if (item.title) {
      blocks.push({ id: `${id}-title`, kind: "text", variant: "process-title", text: item.title });
    }
    if (item.src && (item.type === "image" || item.type === "video")) {
      blocks.push({ id: `${id}-media`, kind: item.type, src: item.src, caption: "" });
    }
    if (item.caption) {
      blocks.push({ id: `${id}-caption`, kind: "text", variant: "caption", text: item.caption });
    }
  });
  return blocks;
}

function explicitBlocks(list) {
  return list.map((item, index) => {
    const kind = item.kind || item.type;
    return {
      id: item.id || `block-${index}`,
      kind,
      variant: item.variant || (kind === "text" ? "copy" : ""),
      text: item.text || item.title || "",
      src: item.src || "",
      caption: item.caption || ""
    };
  }).filter((block) => {
    if (block.kind === "text") {
      return block.text;
    }
    return block.src && (block.kind === "image" || block.kind === "video");
  });
}

function feedbackFor(week) {
  const base = week.feedback && typeof week.feedback === "object" ? week.feedback : {};
  const saved = edits[week.id] || {};
  return {
    text: Object.prototype.hasOwnProperty.call(saved, "feedback") ? saved.feedback : (base.text || ""),
    nextSteps: Object.prototype.hasOwnProperty.call(saved, "nextSteps") ? saved.nextSteps : (base.nextSteps || ""),
    media: Array.isArray(base.media) ? base.media : []
  };
}

function uploadsFor(week) {
  return uploads.filter((item) => item.weekId === week.id);
}

function moveBlock(week, id, direction) {
  const blocks = blocksFor(week);
  const index = blocks.findIndex((block) => block.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= blocks.length) {
    return;
  }
  const order = blocks.map((block) => block.id);
  const [item] = order.splice(index, 1);
  order.splice(target, 0, item);
  rememberOrder(week.id, order);
  rerenderPanel(week, { keepScroll: true, focusId: id, focusMove: direction });
}

function placeBlock(week, fromId, toId) {
  if (!fromId || fromId === toId) {
    return;
  }
  const order = blocksFor(week).map((block) => block.id);
  const from = order.indexOf(fromId);
  const to = order.indexOf(toId);
  if (from < 0 || to < 0) {
    return;
  }
  order.splice(from, 1);
  order.splice(to, 0, fromId);
  rememberOrder(week.id, order);
  rerenderPanel(week, { keepScroll: true, focusId: fromId, focusMove: to > from ? 1 : -1 });
}

function rerenderPanel(week, options) {
  setTimeout(() => renderPanel(week, options), 0);
}

function rememberOrder(weekId, order) {
  weekEdits(weekId).order = order;
  saveEdits();
  allRendered = false;
}

function saveField(weekId, key, value) {
  weekEdits(weekId)[key] = value;
  saveEdits();
  allRendered = false;
}

function weekEdits(weekId) {
  if (!edits[weekId]) {
    edits[weekId] = {};
  }
  return edits[weekId];
}

function loadEdits() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function saveEdits() {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(edits));
  } catch (error) {
    return;
  }
}

async function addUploads(week, files) {
  for (const file of files) {
    const type = fileKind(file);
    if (!type) {
      continue;
    }
    const record = {
      id: crypto.randomUUID(),
      weekId: week.id,
      type,
      name: file.name,
      blob: file
    };
    await idbPut(record);
    uploads.push(record);
  }
  allRendered = false;
  renderPanel(week, { keepScroll: true });
}

async function removeUpload(week, id) {
  await idbDelete(id);
  uploads = uploads.filter((item) => item.id !== id);
  allRendered = false;
  renderPanel(week, { keepScroll: true });
}

function fileKind(file) {
  if (file.type.startsWith("video/")) {
    return "video";
  }
  if (file.type.startsWith("image/")) {
    return "image";
  }
  const name = file.name.toLowerCase();
  if (/\.(mov|mp4|webm|m4v)$/.test(name)) {
    return "video";
  }
  if (/\.(jpg|jpeg|png|gif|webp)$/.test(name)) {
    return "image";
  }
  return "";
}

function openDb() {
  if (!openDb.promise) {
    openDb.promise = new Promise((resolve, reject) => {
      const request = indexedDB.open("living-archive", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("media")) {
          db.createObjectStore("media", { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return openDb.promise;
}

async function loadUploads() {
  try {
    const records = await idbRequest("readonly", (store) => store.getAll());
    uploads = Array.isArray(records) ? records : [];
  } catch (error) {
    uploads = [];
  }
}

function idbPut(record) {
  return idbRequest("readwrite", (store) => store.put(record));
}

function idbDelete(id) {
  return idbRequest("readwrite", (store) => store.delete(id));
}

function idbRequest(mode, run) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const request = run(db.transaction("media", mode).objectStore("media"));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

function revokeObjectUrls(root) {
  root.querySelectorAll("[data-object-url]").forEach((node) => {
    URL.revokeObjectURL(node.dataset.objectUrl);
  });
}

function onViewAllClick(event) {
  event.stopPropagation();
  openAll();
}

function onPanelClick(event) {
  if (event.target.closest("[data-close]")) {
    closePanel();
  }
}

function onAllLayerClick(event) {
  if (event.target.closest("[data-close-all]")) {
    closeAll();
  }
}

function onDocumentClick(event) {
  if (isAllOpen()) {
    if (allWeeks.contains(event.target) || event.target.closest("[data-week]")) {
      return;
    }
    closeAll();
    return;
  }

  if (!panel.classList.contains("is-open")) {
    return;
  }
  if (panel.contains(event.target) || event.target.closest("[data-week]") || event.target.closest("#view-all")) {
    return;
  }
  closePanel();
}

function onKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }
  if (isAllOpen()) {
    closeAll();
    return;
  }
  closePanel();
}

function pauseVideos(root) {
  root.querySelectorAll("video").forEach((video) => {
    video.pause();
  });
}

function mediaSrc(src) {
  return src.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function element(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
