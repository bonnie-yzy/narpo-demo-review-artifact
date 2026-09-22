"use strict";

// One engine, allocated on the first click. Setting changes do no media fetches.
function createPlaybackController(makeAudio, render) {
  let audio = null;
  let active = null;
  let ticket = 0;
  const notify = (record, state) => record && render(record, state);
  const release = () => {
    ticket += 1;
    const previous = active;
    active = null;
    if (audio && previous) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (previous) {
      previous.position = 0;
      notify(previous, "idle");
    }
  };
  const ensureAudio = () => {
    if (audio) return audio;
    audio = makeAudio();
    audio.preload = "none";
    audio.addEventListener("loadedmetadata", () => {
      if (!active || audio.readyState < 1) return;
      if (Number.isFinite(audio.duration)) active.duration = audio.duration;
      if (active.position > 0) audio.currentTime = Math.min(active.position, active.duration);
      notify(active, audio.paused ? "paused" : "playing");
    });
    audio.addEventListener("timeupdate", () => {
      if (!active || audio.readyState < 1) return;
      active.position = audio.currentTime;
      notify(active, audio.paused ? "paused" : "playing");
    });
    audio.addEventListener("playing", () => { if (audio.readyState >= 2 && !audio.paused) notify(active, "playing"); });
    audio.addEventListener("waiting", () => { if (active && !audio.paused) notify(active, "loading"); });
    audio.addEventListener("pause", () => { if (active && audio.paused) notify(active, "paused"); });
    audio.addEventListener("ended", () => {
      if (!active || !audio.ended) return;
      active.position = 0;
      notify(active, "idle");
    });
    audio.addEventListener("error", () => { if (active && audio.error) notify(active, "error"); });
    return audio;
  };
  return {
    async toggle(record) {
      const engine = ensureAudio();
      if (record === active && !engine.paused && !engine.error) {
        ticket += 1;
        engine.pause();
        notify(record, "paused");
        return;
      }
      if (record !== active || engine.error) {
        release();
        active = record;
        engine.src = record.src;
      }
      const request = ++ticket;
      notify(record, "loading");
      try {
        await engine.play();
        if (request === ticket && active === record) notify(record, "playing");
      } catch (error) {
        if (request === ticket && active === record && error.name !== "AbortError") notify(record, "error");
      }
    },
    seek(record, seconds) {
      if (active !== record || !audio || audio.readyState < 1) return;
      record.position = Math.max(0, Math.min(seconds, record.duration));
      audio.currentTime = record.position;
      notify(record, audio.paused ? "paused" : "playing");
    },
    invalidate(records) { if (records.includes(active)) release(); },
    reset: release,
  };
}

function switchDecoding(records, cfg, steps, controller) {
  const key = `${cfg}/${steps}`;
  if (!records.every(record => record.variants[key] && record.durations[key] > 0)) return false;
  controller.invalidate(records);
  records.forEach(record => {
    record.src = record.variants[key];
    record.duration = record.durations[key];
    record.position = 0;
    const name = record.role === "distill" ? (cfg === "0" ? "CFG Distill" : "Step Distill") :
      record.role === "base" ? "OmniVoice · Base" : "NARPO · Ours";
    record.label = `${name}, ${record.sample}, ${steps} Steps, CFG ${cfg}`;
  });
  return true;
}

function initializePage() {
  const clock = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const records = new Map();
  const render = (record, state) => {
    const { element, button, seek, elapsed, total, message } = record;
    record.state = state;
    const playing = state === "playing" || state === "loading";
    element.dataset.state = state;
    element.setAttribute("aria-label", record.label);
    button.setAttribute("aria-label", `${playing ? "Pause" : state === "error" ? "Retry" : "Play"} ${record.label}`);
    button.setAttribute("aria-pressed", String(playing));
    button.firstElementChild.textContent = playing ? "Ⅱ" : "▶";
    seek.max = String(record.duration);
    seek.value = String(record.position);
    seek.disabled = !["playing", "paused"].includes(state);
    seek.setAttribute("aria-label", `Seek ${record.label}`);
    seek.setAttribute("aria-valuetext", `${clock(record.position)} of ${clock(record.duration)}`);
    elapsed.textContent = clock(record.position);
    total.textContent = clock(record.duration);
    const status = state === "error" ? "Unable to load. Retry play." : state === "loading" ? "Loading…" : "";
    if (message.textContent !== status) message.textContent = status;
  };
  const controller = createPlaybackController(() => new Audio(), render);
  document.querySelectorAll(".audio-control").forEach(element => {
    const variants = {};
    Array.from(element.attributes).forEach(attribute => {
      const match = attribute.name.match(/^data-cfg-(\d+)-step-(\d+)$/);
      if (match) variants[`${match[1]}/${match[2]}`] = attribute.value;
    });
    const record = {
      element, variants, durations: JSON.parse(element.dataset.durations || "{}"),
      src: element.dataset.src, duration: Number(element.dataset.duration), label: element.dataset.label,
      role: element.dataset.role, sample: element.dataset.sample, position: 0,
      button: element.querySelector(".audio-toggle"), seek: element.querySelector(".audio-seek"),
      elapsed: element.querySelector(".audio-elapsed"), total: element.querySelector(".audio-duration"),
      message: element.querySelector(".audio-state"),
    };
    records.set(element, record);
    render(record, "idle");
    element.hidden = false;
  });
  document.addEventListener("click", event => {
    const button = event.target.closest(".audio-toggle");
    if (button) controller.toggle(records.get(button.closest(".audio-control")));
  });
  document.addEventListener("input", event => {
    if (event.target.matches(".audio-seek")) controller.seek(records.get(event.target.closest(".audio-control")), Number(event.target.value));
  });
  const robustness = document.getElementById("robustness");
  if (robustness) {
    const steps = document.getElementById("decode-steps");
    const cfg = document.getElementById("decode-cfg");
    const models = [...records.values()].filter(record => record.role);
    const update = () => {
      if (!switchDecoding(models, cfg.value, steps.value, controller)) return;
      models.forEach(record => render(record, "idle"));
      const name = cfg.value === "0" ? "CFG Distill" : "Step Distill";
      robustness.querySelectorAll("[data-distill-label]").forEach(label => { label.textContent = name; });
      document.getElementById("decode-setting").textContent = `${steps.value} Steps · CFG ${cfg.value} · ${name}`;
    };
    steps.disabled = cfg.disabled = false;
    steps.addEventListener("change", update);
    cfg.addEventListener("change", update);
    update();
  }

  // Existing anchors become keyboard-accessible tabs; no-JS retains all rows.
  document.querySelectorAll(".audio-nav").forEach(nav => {
    const tabs = Array.from(nav.querySelectorAll("a"));
    const groups = tabs.map(tab => document.getElementById(tab.hash.slice(1)));
    if (groups.some(group => !group)) return;
    nav.setAttribute("role", "tablist");
    const activate = index => {
      groups.forEach((group, number) => {
        group.hidden = number !== index;
        tabs[number].setAttribute("aria-selected", String(number === index));
        tabs[number].tabIndex = number === index ? 0 : -1;
        if (group.hidden) controller.invalidate([...records.values()].filter(record => group.contains(record.element)));
      });
    };
    tabs.forEach((tab, index) => {
      tab.id = `${groups[index].id}-tab`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", groups[index].id);
      groups[index].setAttribute("role", "tabpanel");
      groups[index].setAttribute("aria-labelledby", tab.id);
      groups[index].tabIndex = 0;
      tab.addEventListener("click", event => { event.preventDefault(); activate(index); });
      tab.addEventListener("keydown", event => {
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); activate(next); tabs[next].focus(); }
      });
    });
    const fromHash = () => {
      const index = groups.findIndex(group => `#${group.id}` === location.hash);
      if (index >= 0) { activate(index); return true; }
      return false;
    };
    if (!fromHash()) activate(0);
    window.addEventListener("hashchange", fromHash);
  });
  document.querySelectorAll("#listening .audio-group").forEach(group => {
    const rows = Array.from(group.querySelectorAll(".audio-row"))
      .filter(row => getComputedStyle(row).display !== "none");
    let visible = Math.min(4, rows.length);
    if (rows.length <= visible) return;
    const more = document.createElement("button");
    more.type = "button";
    more.className = "show-more";
    more.setAttribute("aria-controls", group.id);
    const update = () => {
      rows.forEach((row, index) => { row.hidden = index >= visible; });
      more.hidden = visible >= rows.length;
      more.textContent = `Show ${Math.min(3, rows.length - visible)} more · ${visible} / ${rows.length}`;
    };
    more.addEventListener("click", () => {
      const firstNew = rows[visible];
      visible = Math.min(rows.length, visible + 3);
      update();
      firstNew.tabIndex = -1;
      firstNew.focus({ preventScroll: true });
    });
    group.append(more);
    update();
  });
  window.addEventListener("pagehide", () => controller.reset());
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createPlaybackController, switchDecoding };
} else {
  initializePage();
}
