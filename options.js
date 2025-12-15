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

let currentTheme = "system";

function getEffectiveTheme(theme) {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

function applyTheme(theme) {
  currentTheme = theme;
  const effective = getEffectiveTheme(theme);
  document.documentElement.classList.toggle("dark", effective === "dark");
  updateThemeButtons();
}

function updateThemeButtons() {
  const lightBtn = document.getElementById("opt-theme-light");
  const darkBtn = document.getElementById("opt-theme-dark");
  const systemBtn = document.getElementById("opt-theme-system");
  [lightBtn, darkBtn, systemBtn].forEach((btn) => btn?.classList.remove("active"));
  if (currentTheme === "light") lightBtn?.classList.add("active");
  else if (currentTheme === "dark") darkBtn?.classList.add("active");
  else systemBtn?.classList.add("active");
}

function load() {
  chrome.storage.sync.get({ elementShotPrefs: DEFAULTS }, (data) => {
    const s = migrateSettings(data.elementShotPrefs || DEFAULTS);

    applyTheme(s.theme || "system");

    document.getElementById("opt-mode").value = s.paddingMode;
    document.getElementById("opt-name").value = s.filenamePrefix;
    document.getElementById("opt-pad").value = s.padding;
    document.getElementById("lbl-pad").value = s.padding;
    document.getElementById("opt-cm").value = s.captureMargin;
    document.getElementById("lbl-cm").value = s.captureMargin;
    document.getElementById("opt-color").value = s.paddingColor;
    document.getElementById("opt-ptype").value = s.paddingType;
    document.getElementById("opt-r").value = s.roundedRadius;
    document.getElementById("lbl-r").value = s.roundedRadius;
    document.getElementById("opt-format").value = s.format;
    document.getElementById("opt-q").value = s.quality;
    document.getElementById("lbl-q").value = s.quality;

    // Per-side
    document.getElementById("opt-pt").value = s.paddingSides.top;
    document.getElementById("opt-pr").value = s.paddingSides.right;
    document.getElementById("opt-pb").value = s.paddingSides.bottom;
    document.getElementById("opt-pl").value = s.paddingSides.left;
    document.getElementById("lbl-pt").value = s.paddingSides.top;
    document.getElementById("lbl-pr").value = s.paddingSides.right;
    document.getElementById("lbl-pb").value = s.paddingSides.bottom;
    document.getElementById("lbl-pl").value = s.paddingSides.left;

    toggleModeSections(s.paddingMode);
    toggleQualitySection(s.format);
  });
}

function save() {
  const prefs = {};
  prefs.theme = currentTheme;
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

  document.getElementById("opt-theme-light").addEventListener("click", () => {
    applyTheme("light");
  });
  document.getElementById("opt-theme-dark").addEventListener("click", () => {
    applyTheme("dark");
  });
  document.getElementById("opt-theme-system").addEventListener("click", () => {
    applyTheme("system");
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (currentTheme === "system") {
      applyTheme("system");
    }
  });

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

  // Bidirectional binding between range sliders and number inputs
  const bindSlider = (sliderId, inputId) => {
    const slider = document.getElementById(sliderId);
    const input = document.getElementById(inputId);
    const min = Number(slider.min);
    const max = Number(slider.max);

    slider.addEventListener("input", () => {
      input.value = slider.value;
    });

    input.addEventListener("input", () => {
      let val = Number(input.value) || 0;
      val = Math.max(min, Math.min(max, val));
      slider.value = val;
    });

    input.addEventListener("blur", () => {
      let val = Number(input.value) || 0;
      val = Math.max(min, Math.min(max, val));
      input.value = val;
      slider.value = val;
    });
  };

  bindSlider("opt-pad", "lbl-pad");
  bindSlider("opt-cm", "lbl-cm");
  bindSlider("opt-r", "lbl-r");
  bindSlider("opt-pt", "lbl-pt");
  bindSlider("opt-pr", "lbl-pr");
  bindSlider("opt-pb", "lbl-pb");
  bindSlider("opt-pl", "lbl-pl");
  bindSlider("opt-q", "lbl-q");
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
