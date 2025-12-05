/**
 * Element Snap
 * Copyright (C) 2025 Jonas Fröller
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

function load() {
  chrome.storage.sync.get({ elementShotPrefs: DEFAULTS }, (data) => {
    const s = migrateSettings(data.elementShotPrefs || DEFAULTS);
    document.getElementById("opt-mode").value = s.paddingMode;
    document.getElementById("opt-name").value = s.filenamePrefix;
    document.getElementById("opt-pad").value = s.padding;
    document.getElementById("lbl-pad").textContent = s.padding + "px";
    document.getElementById("opt-cm").value = s.captureMargin;
    document.getElementById("lbl-cm").textContent = s.captureMargin + "px";
    document.getElementById("opt-color").value = s.paddingColor;
    document.getElementById("opt-ptype").value = s.paddingType;
    document.getElementById("opt-r").value = s.roundedRadius;
    document.getElementById("lbl-r").textContent = s.roundedRadius + "px";
    document.getElementById("opt-format").value = s.format;
    document.getElementById("opt-q").value = s.quality;
    document.getElementById("lbl-q").textContent = s.quality + "%";

    // Per-side
    document.getElementById("opt-pt").value = s.paddingSides.top;
    document.getElementById("opt-pr").value = s.paddingSides.right;
    document.getElementById("opt-pb").value = s.paddingSides.bottom;
    document.getElementById("opt-pl").value = s.paddingSides.left;
    document.getElementById("lbl-pt").textContent = s.paddingSides.top + "px";
    document.getElementById("lbl-pr").textContent = s.paddingSides.right + "px";
    document.getElementById("lbl-pb").textContent =
      s.paddingSides.bottom + "px";
    document.getElementById("lbl-pl").textContent = s.paddingSides.left + "px";

    toggleModeSections(s.paddingMode);
    toggleQualitySection(s.format);
  });
}

function save() {
  const prefs = {};
  prefs.paddingMode = document.getElementById("opt-mode").value;
  prefs.filenamePrefix = document.getElementById("opt-name").value;
  prefs.padding = Number(document.getElementById("opt-pad").value) || 0;
  prefs.captureMargin = Number(document.getElementById("opt-cm").value) || 0;
  prefs.paddingColor = document.getElementById("opt-color").value;
  prefs.paddingType = document.getElementById("opt-ptype").value;
  prefs.roundedRadius = Number(document.getElementById("opt-r").value) || 0;
  prefs.format = document.getElementById("opt-format").value;
  prefs.quality = Number(document.getElementById("opt-q").value) || 90;
  if (prefs.paddingMode === "uniform") {
    prefs.paddingSides = {
      top: prefs.padding,
      right: prefs.padding,
      bottom: prefs.padding,
      left: prefs.padding,
    };
  } else {
    prefs.paddingSides = {
      top: Number(document.getElementById("opt-pt").value) || 0,
      right: Number(document.getElementById("opt-pr").value) || 0,
      bottom: Number(document.getElementById("opt-pb").value) || 0,
      left: Number(document.getElementById("opt-pl").value) || 0,
    };
  }
  chrome.storage.sync.set({ elementShotPrefs: prefs }, () => {
    const el = document.getElementById("status");
    if (el) {
      el.textContent = "Saved.";
      setTimeout(() => (el.textContent = ""), 1200);
    }
  });
}

function resetDefaults() {
  chrome.storage.sync.set({ elementShotPrefs: DEFAULTS }, () => {
    load();
    const el = document.getElementById("status");
    if (el) {
      el.textContent = "Reset to defaults.";
      setTimeout(() => (el.textContent = ""), 1200);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  document.getElementById("opt-mode").addEventListener("change", (e) => {
    toggleModeSections(e.target.value);
  });
  document.getElementById("btn-save").addEventListener("click", (e) => {
    e.preventDefault();
    save();
  });
  document.getElementById("btn-reset").addEventListener("click", (e) => {
    e.preventDefault();
    resetDefaults();
  });
  document.getElementById("opt-format").addEventListener("change", (e) => {
    toggleQualitySection(e.target.value);
  });

  // Live labels
  const bindLabel = (id, lbl, suf = "px") => {
    const el = document.getElementById(id);
    const out = document.getElementById(lbl);
    el.addEventListener("input", () => (out.textContent = el.value + suf));
  };
  bindLabel("opt-pad", "lbl-pad");
  bindLabel("opt-cm", "lbl-cm");
  bindLabel("opt-r", "lbl-r");
  bindLabel("opt-pt", "lbl-pt");
  bindLabel("opt-pr", "lbl-pr");
  bindLabel("opt-pb", "lbl-pb");
  bindLabel("opt-pl", "lbl-pl");
  bindLabel("opt-q", "lbl-q", "%");
});

function toggleModeSections(mode) {
  const isSides = mode === "sides";
  document.getElementById("section-sides").style.display = isSides
    ? "block"
    : "none";
}

function toggleQualitySection(fmt) {
  const lossy = fmt === "jpg" || fmt === "webp";
  document.getElementById("section-quality").style.display = lossy
    ? "block"
    : "none";
}
