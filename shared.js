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

const DEFAULTS = {
  theme: "system", // "light" | "dark" | "system"
  padding: 10,
  paddingMode: "uniform",
  paddingSides: { top: 10, right: 10, bottom: 10, left: 10 },
  paddingType: "transparent",
  paddingColor: "#EEF2FF",
  captureMargin: 0,
  format: "png",
  quality: 90,
  filenamePrefix: "element-screenshot",
  panelOpacityLow: false,
  roundedRadius: 0,
  squircleRounding: false, // Use Figma-style smooth corners
  cornerSmoothing: 0.6, // 0-1, controls curve smoothness (0.6 = Apple-like)
};

function migrateSettings(prefs) {
  const out = { ...DEFAULTS, ...(prefs || {}) };
  if (!prefs || typeof prefs !== "object") return out;
  if (!prefs.theme || !["light", "dark", "system"].includes(prefs.theme)) {
    out.theme = "system";
  }
  if (!prefs.paddingSides) {
    const p = Number(prefs.padding ?? DEFAULTS.padding) || 0;
    out.paddingSides = { top: p, right: p, bottom: p, left: p };
  } else {
    const s = prefs.paddingSides;
    out.paddingSides = {
      top: Number(s.top ?? 0) || 0,
      right: Number(s.right ?? 0) || 0,
      bottom: Number(s.bottom ?? 0) || 0,
      left: Number(s.left ?? 0) || 0,
    };
  }
  if (out.paddingMode !== "uniform" && out.paddingMode !== "sides")
    out.paddingMode = "uniform";
  out.captureMargin = Number(prefs.captureMargin ?? 0) || 0;
  out.panelOpacityLow = !!prefs.panelOpacityLow;
  out.roundedRadius = Math.max(0, Number(prefs.roundedRadius ?? 0) || 0);
  out.squircleRounding = !!prefs.squircleRounding;
  out.cornerSmoothing = Math.max(0, Math.min(1, Number(prefs.cornerSmoothing ?? 0.6) || 0.6));
  return out;
}
