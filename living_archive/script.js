const list = document.getElementById("archive-list");
const panel = document.getElementById("doc-panel");
const panelBody = document.getElementById("doc-body");
const viewAll = document.getElementById("view-all");
const allLayer = document.getElementById("all-weeks-layer");
const allWeeks = document.getElementById("all-weeks");
const allScroll = document.getElementById("all-weeks-scroll");

let weeks = [];
let lastTrigger = null;
let allRendered = false;

function init() {
  loadArchive();
  viewAll.addEventListener("click", onViewAllClick);
  panel.addEventListener("click", onPanelClick);
  allLayer.addEventListener("click", onAllLayerClick);
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onKeydown);
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

function renderPanel(week) {
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
}

function renderAll(entries) {
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

  if (variant === "timeline") {
    const kicker = element("p", "doc-kicker");
    kicker.textContent = `${week.week} | ${week.date}`;
    fragment.append(kicker);
    fragment.append(element("div", "all-week-rule"));
  }

  if (week.title) {
    const title = element("h2", "doc-title");
    title.textContent = week.title;
    fragment.append(title);
  }

  if (week.description) {
    const description = element("p", "doc-copy");
    description.textContent = week.description;
    fragment.append(description);
  }

  const process = Array.isArray(week.process) ? week.process : [];

  if (variant === "panel" && !week.title && !week.description && process.length === 0) {
    const empty = element("p", "doc-copy");
    empty.textContent = "This week has not been documented yet.";
    fragment.append(empty);
  }

  process.forEach((item) => {
    fragment.append(renderProcess(item, options));
  });

  return fragment;
}

function renderProcess(item, options) {
  const section = element("section", "doc-process");

  if (item.title) {
    const title = element("h3", "doc-process-title");
    title.textContent = item.title;
    section.append(title);
  }

  if (item.src && item.type === "video") {
    const video = document.createElement("video");
    video.className = "doc-media";
    video.controls = true;
    video.playsInline = true;
    video.autoplay = false;
    video.preload = options.preload || "metadata";
    video.src = mediaSrc(item.src);
    section.append(video);
  } else if (item.src && item.type === "image") {
    const image = document.createElement("img");
    image.className = "doc-media";
    image.alt = item.caption || item.title || "";
    image.decoding = "async";
    if (options.variant === "timeline") {
      image.loading = "lazy";
    }
    image.src = mediaSrc(item.src);
    section.append(image);
  }

  if (item.caption) {
    const caption = element("p", "doc-caption");
    caption.textContent = item.caption;
    section.append(caption);
  }

  return section;
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
