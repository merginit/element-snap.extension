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

let ACTIVE = false;
let LOCKED = false;
let SUPPRESS_NEXT_CLICK = false;
let currentTarget = null;
let currentRect = null; // viewport coords
let settings = { ...DEFAULTS };
let overlay, box, panel;
let padMask, padTop, padRight, padBottom, padLeft;
let padCanvas = null,
  padCtx = null;
let rafId = null;
let hideTimer = null;
let lockRaf = null;
let hiddenElements = []; // stack of { el, prevStyle, hadStyleAttr, label }
let host = null;
let shadowRoot = null;
let panelPos = null; // sticky panel position ({ left, top })
let patternTile = null;
let clickSuppressTimer = null;
let clickSuppressHandler = null;
let panelState = null; // tracks { mode, format, paddingType, isAlpha } to avoid unnecessary rebuilds
let lastKnownUrl = null; // for detecting URL changes
let stateSyncInterval = null;

// Sync state with background script - background's badge state is the source of truth
function startStateSync() {
  if (stateSyncInterval) return;
  stateSyncInterval = setInterval(() => {
    // Check if we have UI elements but background says we're not active
    const hasUI = !!document.getElementById("es-host");
    if (!hasUI) return; // No UI, nothing to sync

    try {
      chrome.runtime.sendMessage({ type: "GET_ACTIVE" }, (res) => {
        if (chrome.runtime.lastError) {
          // Extension context invalidated (extension reloaded/updated)
          stopStateSync();
          // Clean up any orphaned UI
          const hostEl = document.getElementById("es-host");
          if (hostEl) hostEl.remove();
          return;
        }
        if (!res?.active && hasUI) {
          // Force cleanup
          const hostEl = document.getElementById("es-host");
          if (hostEl) hostEl.remove();
          ACTIVE = false;
          LOCKED = false;
          host = null;
          shadowRoot = null;
          panel = null;
          overlay = null;
        }
      });
    } catch (_) {
      // Extension context invalidated
      stopStateSync();
    }
  }, 500);
}

function stopStateSync() {
  if (stateSyncInterval) {
    clearInterval(stateSyncInterval);
    stateSyncInterval = null;
  }
}

startStateSync();

function getPatternTile() {
  if (!patternTile) {
    patternTile = document.createElement("canvas");
    patternTile.width = 12;
    patternTile.height = 12;
    const t = patternTile.getContext("2d");
    t.fillStyle = "#e5e7eb";
    t.fillRect(0, 0, 6, 6);
    t.fillRect(6, 6, 6, 6);
  }
  return patternTile;
}

function css(strings, ...values) {
  return strings.reduce((acc, str, i) => acc + str + (values[i] ?? ""), "");
}
function supportsAlpha(fmt) {
  return fmt === "png" || fmt === "webp" || fmt === "svg";
}

const PANEL_W = 280;
const PANEL_MARGIN = 8;
const PANEL_APPROX_H = 260;

const Z_OVERLAY = 2147483640;
const Z_PADMASK = 2147483642;
const Z_OUTLINE = 2147483644;
const Z_PANEL = 2147483646;
const Z_HOST = 2147483647;

const CLICK_SUPPRESS_MS = 350;
const CAPTURE_TIMEOUT_MS = 5000;
const PERSIST_DEBOUNCE_MS = 300;
const SCROLL_INTO_VIEW_MS = 120;
const FRAME_SETTLE_MS = 30;

const STYLE = css`
  :host {
    all: initial;
    /* Light theme (default) */
    --es-background: oklch(1 0 0);
    --es-foreground: oklch(0.145 0 0);
    --es-card: oklch(1 0 0);
    --es-card-foreground: oklch(0.145 0 0);
    --es-primary: oklch(0.488 0.243 264.376);
    --es-primary-foreground: oklch(0.97 0.014 254.604);
    --es-muted: oklch(0.97 0 0);
    --es-muted-foreground: oklch(0.556 0 0);
    --es-accent: oklch(0.97 0 0);
    --es-border: oklch(0.922 0 0);
    --es-input: oklch(0.922 0 0);
    --es-radius: 0.625rem;
  }
  :host(.dark) {
    --es-background: oklch(0.145 0 0);
    --es-foreground: oklch(0.985 0 0);
    --es-card: oklch(0.205 0 0);
    --es-card-foreground: oklch(0.985 0 0);
    --es-primary: oklch(0.42 0.18 266);
    --es-primary-foreground: oklch(0.97 0.014 254.604);
    --es-muted: oklch(0.269 0 0);
    --es-muted-foreground: oklch(0.708 0 0);
    --es-accent: oklch(0.371 0 0);
    --es-border: oklch(1 0 0 / 10%);
    --es-input: oklch(1 0 0 / 15%);
  }
  * {
    box-sizing: border-box;
  }
  button,
  input,
  select,
  textarea {
    font: inherit;
    color: inherit;
  }
  #es-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: ${Z_OVERLAY};
  }
  #es-outline {
    position: fixed;
    border: 2px solid var(--es-primary);
    outline: 2px solid oklch(from var(--es-primary) l c h / 25%);
    outline-offset: 2px;
    border-radius: 0px;
    box-shadow: 0 0 0 4px oklch(from var(--es-primary) l c h / 15%);
    transition: left 80ms, top 80ms, width 80ms, height 80ms;
    z-index: ${Z_OUTLINE};
  }
  #es-padmask {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: ${Z_PADMASK};
  }
  .es-pad {
    position: fixed;
    pointer-events: none;
  }
  #es-panel {
    position: fixed;
    width: ${PANEL_W}px;
    z-index: ${Z_PANEL};
    pointer-events: auto;
    font: 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter",
      Helvetica, Arial, sans-serif;
    color: var(--es-card-foreground);
    contain: content;
    transition: opacity 120ms ease;
  }
  #es-panel .card {
    background: var(--es-card);
    border: 1px solid var(--es-border);
    border-radius: var(--es-radius);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);
    padding: 12px;
    max-height: min(72vh, calc(100vh - 16px));
    overflow: auto;
    overscroll-behavior: contain;
    transition: background-color 0.15s ease, border-color 0.15s ease;
    scrollbar-width: thin;
    scrollbar-color: var(--es-muted) transparent;
  }
  #es-panel .card::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  #es-panel .card::-webkit-scrollbar-track {
    background: transparent;
    border-radius: 3px;
  }
  #es-panel .card::-webkit-scrollbar-thumb {
    background: var(--es-muted);
    border-radius: 3px;
  }
  #es-panel .card::-webkit-scrollbar-thumb:hover {
    background: var(--es-muted-foreground);
  }
  #es-panel label {
    display: block;
    font-size: 11px;
    font-weight: 500;
    color: var(--es-muted-foreground);
    margin: 8px 0 4px;
  }
  #es-panel input[type="range"] {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: var(--es-muted);
    appearance: none;
    cursor: pointer;
    margin: 0;
  }
  #es-panel input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--es-primary);
    border: none;
    box-shadow: 0 0 0 0 oklch(from var(--es-primary) l c h / 0%);
    cursor: pointer;
    transition: box-shadow 0.2s ease;
  }
  #es-panel input[type="range"]::-webkit-slider-thumb:hover {
    box-shadow: 0 0 0 3px oklch(from var(--es-primary) l c h / 25%);
  }
  #es-panel input[type="range"]:active::-webkit-slider-thumb {
    box-shadow: 0 0 0 4px oklch(from var(--es-primary) l c h / 35%);
  }
  #es-panel input[type="range"]::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--es-primary);
    border: none;
    box-shadow: 0 0 0 0 oklch(from var(--es-primary) l c h / 0%);
    cursor: pointer;
    transition: box-shadow 0.2s ease;
  }
  #es-panel input[type="range"]::-moz-range-thumb:hover {
    box-shadow: 0 0 0 3px oklch(from var(--es-primary) l c h / 25%);
  }
  #es-panel input[type="range"]:active::-moz-range-thumb {
    box-shadow: 0 0 0 4px oklch(from var(--es-primary) l c h / 35%);
  }
  #es-panel input[type="range"]:focus {
    outline: none;
  }
  #es-panel input[type="range"]:focus::-webkit-slider-thumb {
    box-shadow: 0 0 0 3px oklch(from var(--es-primary) l c h / 30%);
  }
  #es-panel input[type="range"]:focus::-moz-range-thumb {
    box-shadow: 0 0 0 3px oklch(from var(--es-primary) l c h / 30%);
  }
  #es-panel .row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  #es-panel .col {
    display: grid;
    gap: 6px;
  }
  #es-panel .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 28px;
    padding: 0 10px;
    border-radius: calc(var(--es-radius) - 2px);
    border: 1px solid var(--es-border);
    background: var(--es-card);
    color: var(--es-card-foreground);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: background-color 0.15s ease, border-color 0.15s ease;
  }
  #es-panel .btn:hover {
    background: var(--es-accent);
  }
  #es-panel .btn.primary {
    background: var(--es-primary);
    color: var(--es-primary-foreground);
    border-color: var(--es-primary);
  }
  #es-panel .btn.primary:hover {
    opacity: 0.9;
  }
  #es-panel .btn.ghost {
    background: transparent;
    border-color: var(--es-border);
  }
  #es-panel .btn.ghost:hover {
    background: var(--es-accent);
  }
  #es-panel select,
  #es-panel input[type="text"],
  #es-panel input[type="color"] {
    height: 28px;
    border: 1px solid var(--es-border);
    border-radius: calc(var(--es-radius) - 2px);
    padding: 0 8px;
    width: 100%;
    background: var(--es-card);
    color: var(--es-card-foreground);
    transition: border-color 0.15s ease;
  }
  #es-panel select {
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    padding-right: 28px;
  }
  #es-panel select:focus,
  #es-panel input[type="text"]:focus,
  #es-panel input[type="color"]:focus {
    outline: none;
    border-color: var(--es-primary);
    box-shadow: 0 0 0 2px oklch(from var(--es-primary) l c h / 20%);
  }
  #es-panel .muted {
    color: var(--es-muted-foreground);
    font-size: 11px;
  }
  #es-panel .kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 20px;
    padding: 0 6px;
    border-radius: calc(var(--es-radius) - 2px);
    border: 1px solid var(--es-border);
    background: var(--es-muted);
    font-size: 11px;
    font-weight: 600;
    color: var(--es-card-foreground);
  }
  #es-panel .shortcut {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  #es-panel .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  #es-panel strong {
    color: var(--es-card-foreground);
  }
  #es-panel .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    user-select: none;
  }
  #es-panel .checkbox-label input[type="checkbox"] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  #es-panel .checkbox-custom {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border: 1px solid var(--es-border);
    border-radius: 4px;
    background: var(--es-card);
    transition: all 0.15s ease;
    flex-shrink: 0;
  }
  #es-panel .checkbox-label input[type="checkbox"]:checked + .checkbox-custom {
    background: var(--es-primary);
    border-color: var(--es-primary);
  }
  #es-panel .checkbox-custom::after {
    content: '';
    display: none;
    width: 4px;
    height: 8px;
    border: solid var(--es-primary-foreground);
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
    margin-bottom: 2px;
  }
  #es-panel .checkbox-label input[type="checkbox"]:checked + .checkbox-custom::after {
    display: block;
  }
  #es-panel .checkbox-label input[type="checkbox"]:focus + .checkbox-custom {
    box-shadow: 0 0 0 2px oklch(from var(--es-primary) l c h / 25%);
  }
`;

function ensureHost() {
  if (host && shadowRoot) {
    applyHostTheme();
    return shadowRoot;
  }
  host = document.getElementById("es-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "es-host";
    // Prevent host from inheriting text properties that could leak through UA behavior
    host.style.all = "initial";
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.zIndex = String(Z_HOST);
    host.style.pointerEvents = "none";
    document.body.appendChild(host);
  }
  if (!host.shadowRoot) {
    shadowRoot = host.attachShadow({ mode: "open" });
  } else {
    shadowRoot = host.shadowRoot;
  }
  applyHostTheme();
  return shadowRoot;
}

function injectStyle() {
  ensureHost();
  if (shadowRoot.getElementById("es-style")) return;
  const style = document.createElement("style");
  style.id = "es-style";
  style.textContent = STYLE;
  shadowRoot.appendChild(style);
}

function ensureOverlay() {
  if (overlay) return overlay;
  injectStyle();
  overlay = document.createElement("div");
  overlay.id = "es-overlay";

  // Outline
  box = document.createElement("div");
  box.id = "es-outline";
  overlay.appendChild(box);

  // Padding preview mask with 4 sides
  padMask = document.createElement("div");
  padMask.id = "es-padmask";
  padTop = document.createElement("div");
  padTop.className = "es-pad";
  padRight = document.createElement("div");
  padRight.className = "es-pad";
  padBottom = document.createElement("div");
  padBottom.className = "es-pad";
  padLeft = document.createElement("div");
  padLeft.className = "es-pad";
  const cvs = document.createElement("canvas");
  cvs.className = "es-pad";
  cvs.style.pointerEvents = "none";
  padCanvas = cvs;
  padCtx = cvs.getContext("2d");
  padMask.appendChild(padTop);
  padMask.appendChild(padRight);
  padMask.appendChild(padBottom);
  padMask.appendChild(padLeft);
  padMask.appendChild(cvs);
  overlay.appendChild(padMask);

  ensureHost();
  shadowRoot.appendChild(overlay);
  return overlay;
}

function removeOverlay() {
  if (panel) {
    try { panel.remove(); } catch (_) { }
    panel = null;
    panelState = null;
  }
  if (overlay) {
    try { overlay.remove(); } catch (_) { }
    overlay = null;
    box = null;
    padMask = null;
    padTop = padRight = padBottom = padLeft = null;
    padCanvas = null;
    padCtx = null;
  }
  if (host) {
    try { host.remove(); } catch (_) { }
    host = null;
    shadowRoot = null;
  }

  // Fallback: directly query and remove #es-host in case our reference is stale
  const existingHost = document.getElementById("es-host");
  if (existingHost) {
    try { existingHost.remove(); } catch (_) { }
  }
}

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ elementShotPrefs: DEFAULTS }, (data) => {
      const prefs = migrateSettings(data.elementShotPrefs || DEFAULTS);
      settings = prefs;
      applyHostTheme();
      resolve(settings);
    });
  });
}

function getEffectiveTheme(theme) {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

function applyHostTheme() {
  if (!host) return;
  const effective = getEffectiveTheme(settings.theme || "system");
  host.classList.toggle("dark", effective === "dark");
}

// Listen for settings changes from options page
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.elementShotPrefs) {
    const newPrefs = migrateSettings(changes.elementShotPrefs.newValue || DEFAULTS);
    const themeChanged = newPrefs.theme !== settings.theme;

    // Update all settings
    settings = newPrefs;

    // Apply theme if changed
    if (themeChanged) {
      applyHostTheme();
    }

    // Re-render the preview if the extension is active
    if (ACTIVE && currentRect) {
      positionUI(currentRect);
      renderPanel();
    }
  }
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (settings.theme === "system") {
    applyHostTheme();
  }
});

let persistTimer = null;
function persistSettings() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    chrome.storage.sync.set({ elementShotPrefs: settings });
  }, PERSIST_DEBOUNCE_MS);
}

function throttleRaf(fn) {
  return (...args) => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => fn(...args));
  };
}

function pickTargetFromPoint(x, y) {
  const stack =
    (document.elementsFromPoint ? document.elementsFromPoint(x, y) : []) || [];
  // Avoid reacting while hovering the panel inside shadow DOM
  if (panel) {
    const pr = panel.getBoundingClientRect();
    if (x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom)
      return currentTarget;
  }
  for (const el of stack) {
    if (!el) continue;
    if (el === document.documentElement || el === document.body) continue;
    if (el.closest && el.closest('[data-es-hidden="1"]')) continue;
    if (overlay && (el === overlay || el === box || el === padMask)) continue;
    if (host && el === host) continue;
    if (panel && (el === panel || panel.contains(el))) continue;
    return el;
  }
  const el = document.elementFromPoint(x, y);
  if (
    el &&
    el !== document.documentElement &&
    el !== document.body &&
    el !== host &&
    (!panel || !panel.contains(el)) &&
    !(el.closest && el.closest('[data-es-hidden="1"]'))
  )
    return el;
  return currentTarget;
}

function computePanelPosition(rect) {
  const vw = window.innerWidth,
    vh = window.innerHeight;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const approxH = PANEL_APPROX_H;
  const left = Number(rect.x) || 0;
  const top = Number(rect.y) || 0;
  const width = Math.max(0, Number(rect.width) || 0);
  const height = Math.max(0, Number(rect.height) || 0);
  const right = left + width;
  const bottom = top + height;
  if (!isFinite(left) || !isFinite(top))
    return { left: Math.max(8, vw - PANEL_W - 8), top: 8 };
  if (right + PANEL_MARGIN + PANEL_W <= vw - 8)
    return { left: right + PANEL_MARGIN, top: clamp(top, 8, vh - approxH - 8) };
  if (left - PANEL_MARGIN - PANEL_W >= 8)
    return {
      left: left - PANEL_MARGIN - PANEL_W,
      top: clamp(top, 8, vh - approxH - 8),
    };
  if (bottom + PANEL_MARGIN + approxH <= vh - 8)
    return {
      left: clamp(left, 8, vw - PANEL_W - 8),
      top: bottom + PANEL_MARGIN,
    };
  if (top - PANEL_MARGIN - approxH >= 8)
    return {
      left: clamp(left, 8, vw - PANEL_W - 8),
      top: top - PANEL_MARGIN - approxH,
    };
  return {
    left: clamp(right + PANEL_MARGIN, 8, vw - PANEL_W - 8),
    top: clamp(top, 8, vh - approxH - 8),
  };
}
function getPanelApproxHeight() {
  if (panel) {
    const r = panel.getBoundingClientRect();
    if (r && r.height) return Math.min(r.height, window.innerHeight - 16);
  }
  return PANEL_APPROX_H;
}

function clampPanelPos(pos) {
  if (!pos) pos = { left: 8, top: 8 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const approxH = getPanelApproxHeight();
  const left = Math.max(8, Math.min(vw - PANEL_W - 8, pos.left));
  const top = Math.max(8, Math.min(vh - approxH - 8, pos.top));
  return { left, top };
}

function setPanelPosition(pos) {
  if (!panel) return;
  panel.style.left = pos.left + "px";
  panel.style.top = pos.top + "px";
  panel.style.display = "block";
}

function ensurePanelPositionFromRect(rect) {
  if (!panel) return;
  const desired = computePanelPosition(rect);
  if (!panelPos || !LOCKED) {
    panelPos = desired;
  }
  panelPos = clampPanelPos(panelPos);
  setPanelPosition(panelPos);
}

function clampPanelWithinViewport() {
  if (!panel) return;
  panelPos = clampPanelPos(
    panelPos || { left: panel.offsetLeft || 8, top: panel.offsetTop || 8 }
  );
  setPanelPosition(panelPos);
}

function getPadsCss() {
  if (settings.paddingMode === "sides") {
    const s = settings.paddingSides || DEFAULTS.paddingSides;
    return {
      l: Number(s.left) || 0,
      r: Number(s.right) || 0,
      t: Number(s.top) || 0,
      b: Number(s.bottom) || 0,
    };
  }
  const p = Number(settings.padding) || 0;
  return { l: p, r: p, t: p, b: p };
}

function setPadPreview(rect) {
  if (!padMask || !padTop) return;
  const pads = getPadsCss();
  const m = Math.max(0, Number(settings.captureMargin) || 0);
  const show = pads.l + pads.r + pads.t + pads.b > 0 || m > 0;
  padMask.style.display = show ? "block" : "none";
  if (!show) return;
  const isAlpha = supportsAlpha(settings.format);
  const useColor = settings.paddingType === "colored" || !isAlpha;

  const bg = useColor
    ? settings.paddingColor
    : "repeating-conic-gradient(#e5e7eb 0% 25%, transparent 0% 50%) 0 / 12px 12px";
  const isPattern = !useColor;

  // Expand preview origin by capture margin so padding is pushed outwards
  const base = {
    x: rect.x - m,
    y: rect.y - m,
    width: rect.width + 2 * m,
    height: rect.height + 2 * m,
  };

  const apply = (el, left, top, width, height) => {
    el.style.left = left + "px";
    el.style.top = top + "px";
    el.style.width = Math.max(0, width) + "px";
    el.style.height = Math.max(0, height) + "px";
    // Reset per-corner radius; set outer corners explicitly below
    el.style.borderRadius = "0px";
    if (isPattern) {
      el.style.background = bg;
      el.style.backgroundColor = "";
    } else {
      el.style.background = "none";
      el.style.backgroundColor = bg;
    }
    el.style.display = width <= 0 || height <= 0 ? "none" : "block";
  };

  // Top
  apply(
    padTop,
    base.x - pads.l,
    base.y - pads.t,
    base.width + pads.l + pads.r,
    pads.t
  );
  const r = Math.max(0, Number(settings.roundedRadius) || 0);
  padTop.style.borderTopLeftRadius = r + "px";
  padTop.style.borderTopRightRadius = r + "px";
  padTop.style.borderBottomLeftRadius = "0px";
  padTop.style.borderBottomRightRadius = "0px";
  // Bottom
  apply(
    padBottom,
    base.x - pads.l,
    base.y + base.height,
    base.width + pads.l + pads.r,
    pads.b
  );
  padBottom.style.borderBottomLeftRadius = r + "px";
  padBottom.style.borderBottomRightRadius = r + "px";
  padBottom.style.borderTopLeftRadius = "0px";
  padBottom.style.borderTopRightRadius = "0px";
  // Left
  apply(padLeft, base.x - pads.l, base.y, pads.l, base.height);
  padLeft.style.borderTopLeftRadius = r + "px";
  padLeft.style.borderBottomLeftRadius = r + "px";
  padLeft.style.borderTopRightRadius = "0px";
  padLeft.style.borderBottomRightRadius = "0px";
  // Right
  apply(padRight, base.x + base.width, base.y, pads.r, base.height);
  padRight.style.borderTopRightRadius = r + "px";
  padRight.style.borderBottomRightRadius = r + "px";
  padRight.style.borderTopLeftRadius = "0px";
  padRight.style.borderBottomLeftRadius = "0px";

  // Use canvas overlay for precise outer rounded rectangle ring (covers capture margin + padding)
  if (padCanvas && padCtx) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    if (padCanvas.width !== Math.floor(vw * dpr))
      padCanvas.width = Math.floor(vw * dpr);
    if (padCanvas.height !== Math.floor(vh * dpr))
      padCanvas.height = Math.floor(vh * dpr);
    padCanvas.style.left = "0px";
    padCanvas.style.top = "0px";
    padCanvas.style.width = vw + "px";
    padCanvas.style.height = vh + "px";
    padCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    padCtx.clearRect(0, 0, vw, vh);

    const outer = {
      x: base.x - pads.l,
      y: base.y - pads.t,
      w: base.width + pads.l + pads.r,
      h: base.height + pads.t + pads.b,
    };
    const marginRect = { x: base.x, y: base.y, w: base.width, h: base.height };
    const contentRect = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    const rr = Math.max(0, Number(settings.roundedRadius) || 0);
    const useSquircle = !!settings.squircleRounding;
    const smoothing = Math.max(0, Math.min(1, Number(settings.cornerSmoothing) || 0.6));
    const rOuter = Math.min(rr, Math.floor(Math.min(outer.w, outer.h) / 2));
    const rMargin = Math.min(
      rr,
      Math.floor(Math.min(marginRect.w, marginRect.h) / 2)
    );
    const rContent = Math.min(
      rr,
      Math.floor(Math.min(contentRect.w, contentRect.h) / 2)
    );

    // 1) Padding band: outer(rounded) - margin(rounded)
    if (pads.l + pads.r + pads.t + pads.b > 0) {
      padCtx.beginPath();
      smartRectPath(padCtx, outer.x, outer.y, outer.w, outer.h, rOuter, useSquircle, smoothing);
      smartRectPath(
        padCtx,
        marginRect.x,
        marginRect.y,
        marginRect.w,
        marginRect.h,
        rMargin,
        useSquircle,
        smoothing
      );
      if (useColor) {
        padCtx.fillStyle = settings.paddingColor;
      } else {
        padCtx.fillStyle = padCtx.createPattern(getPatternTile(), "repeat");
      }
      padCtx.fill("evenodd");
    }

    // 2) Capture margin band: margin(rounded) - content(rounded)
    if (m > 0) {
      padCtx.beginPath();
      smartRectPath(
        padCtx,
        marginRect.x,
        marginRect.y,
        marginRect.w,
        marginRect.h,
        rMargin,
        useSquircle,
        smoothing
      );
      smartRectPath(
        padCtx,
        contentRect.x,
        contentRect.y,
        contentRect.w,
        contentRect.h,
        rContent,
        useSquircle,
        smoothing
      );
      padCtx.fillStyle = padCtx.createPattern(getPatternTile(), "repeat");
      padCtx.fill("evenodd");
    }

    // Hide the 4 rectangular pads; canvas represents the preview now
    padTop.style.display = "none";
    padRight.style.display = "none";
    padBottom.style.display = "none";
    padLeft.style.display = "none";
  }
}

function positionUI(rect) {
  if (!rect) return;
  ensureOverlay();
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (overlay) overlay.style.display = "block";
  if (box) {
    box.style.display = "block";
    box.style.left = rect.x + "px";
    box.style.top = rect.y + "px";
    box.style.width = rect.width + "px";
    box.style.height = rect.height + "px";
    // Element outline is always square; rounding applies only to padding/margin ring
    box.style.borderRadius = "0px";
  }
  setPadPreview(rect);
  if (panel) ensurePanelPositionFromRect(rect);
}

const onMouseMove = throttleRaf((e) => {
  if (!ACTIVE) return;
  if (LOCKED) {
    ensureLockedTracking();
    return;
  }
  // Avoid re-rendering the panel while interacting with it (breaks slider drag)
  if (panel) {
    const pr = panel.getBoundingClientRect();
    if (
      e.clientX >= pr.left &&
      e.clientX <= pr.right &&
      e.clientY >= pr.top &&
      e.clientY <= pr.bottom
    ) {
      return;
    }
  }
  const el = pickTargetFromPoint(e.clientX, e.clientY);
  if (!el) return;
  currentTarget = el;
  const r = el.getBoundingClientRect();
  currentRect = {
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
  positionUI(currentRect);
  if (!panel) renderPanel();
});

function hideUIForScroll() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (overlay) overlay.style.display = "none";
    if (box) box.style.display = "none";
    if (panel) clampPanelWithinViewport();
    if (padMask) padMask.style.display = "none";
  }, 0);
}

const onScroll = throttleRaf(() => {
  if (ACTIVE) {
    if (LOCKED) {
      ensureLockedTracking();
    } else {
      hideUIForScroll();
    }
    clampPanelWithinViewport();
  }
});
const onResize = throttleRaf(() => {
  if (ACTIVE) {
    if (LOCKED) {
      ensureLockedTracking();
    } else {
      hideUIForScroll();
    }
    clampPanelWithinViewport();
  }
});

function cleanupClickSuppression() {
  if (clickSuppressTimer) {
    clearTimeout(clickSuppressTimer);
    clickSuppressTimer = null;
  }
  if (clickSuppressHandler) {
    window.removeEventListener("click", clickSuppressHandler, true);
    window.removeEventListener("mouseup", clickSuppressHandler, true);
    window.removeEventListener("mousedown", clickSuppressHandler, true);
    clickSuppressHandler = null;
  }
  SUPPRESS_NEXT_CLICK = false;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), ms)
    ),
  ]);
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Squircle (Figma-style smooth corners) implementation
// Based on: https://www.figma.com/blog/desperately-seeking-squircles
// Ported from: https://github.com/phamfoo/figma-squircle

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculate path parameters for a corner based on Figma's algorithm.
 */
function getPathParamsForCorner(cornerRadius, cornerSmoothing, roundingAndSmoothingBudget) {
  let p = (1 + cornerSmoothing) * cornerRadius;

  const maxCornerSmoothing = roundingAndSmoothingBudget / cornerRadius - 1;
  cornerSmoothing = Math.min(cornerSmoothing, maxCornerSmoothing);
  p = Math.min(p, roundingAndSmoothingBudget);

  const arcMeasure = 90 * (1 - cornerSmoothing);
  const arcSectionLength = Math.sin(toRadians(arcMeasure / 2)) * cornerRadius * Math.sqrt(2);

  const angleAlpha = (90 - arcMeasure) / 2;
  const p3ToP4Distance = cornerRadius * Math.tan(toRadians(angleAlpha / 2));

  const angleBeta = 45 * cornerSmoothing;
  const c = p3ToP4Distance * Math.cos(toRadians(angleBeta));
  const d = c * Math.tan(toRadians(angleBeta));

  let b = (p - arcSectionLength - c - d) / 3;
  let a = 2 * b;

  return { a, b, c, d, p, arcSectionLength, cornerRadius };
}

/**
 * Generate SVG path string for a squircle rectangle.
 * Returns the SVG path data string that can be used with Path2D.
 */
function getSquircleSvgPath(x, y, w, h, r, cornerSmoothing) {
  const roundingAndSmoothingBudget = Math.min(w, h) / 2;
  const cornerRadius = Math.min(r, roundingAndSmoothingBudget);
  const params = getPathParamsForCorner(cornerRadius, cornerSmoothing, roundingAndSmoothingBudget);
  const { a, b, c, d, p, arcSectionLength } = params;
  const R = params.cornerRadius;

  const n = (val) => val.toFixed(4);

  // Build SVG path string
  // Starting point: top edge, after top-left corner area
  let path = `M ${n(x + p)} ${n(y)}`;

  // Line to top-right corner start
  path += ` L ${n(x + w - p)} ${n(y)}`;

  // === TOP-RIGHT CORNER ===
  path += ` c ${n(a)} 0 ${n(a + b)} 0 ${n(a + b + c)} ${n(d)}`;
  path += ` a ${n(R)} ${n(R)} 0 0 1 ${n(arcSectionLength)} ${n(arcSectionLength)}`;
  path += ` c ${n(d)} ${n(c)} ${n(d)} ${n(b + c)} ${n(d)} ${n(a + b + c)}`;

  // Line down right edge to bottom-right corner
  path += ` L ${n(x + w)} ${n(y + h - p)}`;

  // === BOTTOM-RIGHT CORNER ===
  path += ` c 0 ${n(a)} 0 ${n(a + b)} ${n(-d)} ${n(a + b + c)}`;
  path += ` a ${n(R)} ${n(R)} 0 0 1 ${n(-arcSectionLength)} ${n(arcSectionLength)}`;
  path += ` c ${n(-c)} ${n(d)} ${n(-(b + c))} ${n(d)} ${n(-(a + b + c))} ${n(d)}`;

  // Line along bottom edge to bottom-left corner
  path += ` L ${n(x + p)} ${n(y + h)}`;

  // === BOTTOM-LEFT CORNER ===
  path += ` c ${n(-a)} 0 ${n(-(a + b))} 0 ${n(-(a + b + c))} ${n(-d)}`;
  path += ` a ${n(R)} ${n(R)} 0 0 1 ${n(-arcSectionLength)} ${n(-arcSectionLength)}`;
  path += ` c ${n(-d)} ${n(-c)} ${n(-d)} ${n(-(b + c))} ${n(-d)} ${n(-(a + b + c))}`;

  // Line up left edge to top-left corner
  path += ` L ${n(x)} ${n(y + p)}`;

  // === TOP-LEFT CORNER ===
  path += ` c 0 ${n(-a)} 0 ${n(-(a + b))} ${n(d)} ${n(-(a + b + c))}`;
  path += ` a ${n(R)} ${n(R)} 0 0 1 ${n(arcSectionLength)} ${n(-arcSectionLength)}`;
  path += ` c ${n(c)} ${n(-d)} ${n(b + c)} ${n(-d)} ${n(a + b + c)} ${n(-d)}`;

  path += ' Z';

  return path;
}

function squircleRectPath(ctx, x, y, w, h, r, cornerSmoothing) {
  if (r <= 0 || cornerSmoothing <= 0) {
    roundRectPath(ctx, x, y, w, h, r);
    return;
  }

  const roundingAndSmoothingBudget = Math.min(w, h) / 2;
  const cornerRadius = Math.min(r, roundingAndSmoothingBudget);

  // Guard: if cornerRadius is 0 or budget is too small, use regular rounded rect
  if (cornerRadius <= 0 || roundingAndSmoothingBudget <= 0) {
    roundRectPath(ctx, x, y, w, h, Math.max(0, r));
    return;
  }

  const params = getPathParamsForCorner(cornerRadius, cornerSmoothing, roundingAndSmoothingBudget);
  const { a, b, c, d, p, arcSectionLength } = params;
  const R = params.cornerRadius;

  // For bezier arc approximation: k = (4/3) * tan(θ/4)
  // where θ is the arc sweep angle
  const effectiveSmoothing = Math.min(cornerSmoothing, roundingAndSmoothingBudget / cornerRadius - 1);

  // Guard: if effective smoothing is too low (approaching 0), 
  // the squircle degenerates to a regular rounded rect
  if (effectiveSmoothing < 0.01) {
    roundRectPath(ctx, x, y, w, h, cornerRadius);
    return;
  }

  const arcMeasure = 90 * (1 - effectiveSmoothing);
  const arcAngleRad = toRadians(arcMeasure);
  const kappa = (4 / 3) * Math.tan(arcAngleRad / 4);

  // Normalize the tangent vectors
  const mag1 = Math.sqrt(c * c + d * d);

  // Guard: if tangent magnitude is too small, fall back to rounded rect
  if (mag1 < 0.001) {
    roundRectPath(ctx, x, y, w, h, cornerRadius);
    return;
  }

  const t1x = c / mag1; // start tangent x component (for top-right)
  const t1y = d / mag1; // start tangent y component
  const t2x = d / mag1; // end tangent x component  
  const t2y = c / mag1; // end tangent y component

  const ctrlDist = kappa * R;

  // Start at top edge
  ctx.moveTo(x + p, y);

  // Top edge to top-right
  ctx.lineTo(x + w - p, y);

  // === TOP-RIGHT CORNER ===
  let cx = x + w - p;
  let cy = y;

  // First bezier: transition into corner
  ctx.bezierCurveTo(cx + a, cy, cx + a + b, cy, cx + a + b + c, cy + d);
  cx += a + b + c;
  cy += d;

  // Arc: from (cx, cy) to (cx + arcSectionLength, cy + arcSectionLength)
  // Start tangent: (t1x, t1y) = (c, d) normalized, pointing toward +x, +y
  // End tangent: (t2x, t2y) = (d, c) normalized, pointing toward +x, +y
  // Control points: cp1 = start + ctrlDist * start_tangent
  //                 cp2 = end - ctrlDist * end_tangent
  {
    const cp1x = cx + ctrlDist * t1x;
    const cp1y = cy + ctrlDist * t1y;
    const endX = cx + arcSectionLength;
    const endY = cy + arcSectionLength;
    const cp2x = endX - ctrlDist * t2x;
    const cp2y = endY - ctrlDist * t2y;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
    cx = endX;
    cy = endY;
  }

  // Second bezier: transition out of corner
  ctx.bezierCurveTo(cx + d, cy + c, cx + d, cy + b + c, cx + d, cy + a + b + c);
  cx += d;
  cy += a + b + c;

  // Right edge to bottom-right
  ctx.lineTo(x + w, y + h - p);
  cx = x + w;
  cy = y + h - p;

  // === BOTTOM-RIGHT CORNER ===
  ctx.bezierCurveTo(cx, cy + a, cx, cy + a + b, cx - d, cy + a + b + c);
  cx -= d;
  cy += a + b + c;

  // Arc: from (cx, cy) to (cx - arcSectionLength, cy + arcSectionLength)
  // Start tangent: (-d, c) normalized (rotating 90° from top-right case)
  // End tangent: (-c, d) normalized
  {
    const cp1x = cx + ctrlDist * (-t2x);
    const cp1y = cy + ctrlDist * t2y;
    const endX = cx - arcSectionLength;
    const endY = cy + arcSectionLength;
    const cp2x = endX - ctrlDist * (-t1x);
    const cp2y = endY - ctrlDist * t1y;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
    cx = endX;
    cy = endY;
  }

  ctx.bezierCurveTo(cx - c, cy + d, cx - b - c, cy + d, cx - a - b - c, cy + d);
  cx -= a + b + c;
  cy += d;

  // Bottom edge to bottom-left
  ctx.lineTo(x + p, y + h);
  cx = x + p;
  cy = y + h;

  // === BOTTOM-LEFT CORNER ===
  ctx.bezierCurveTo(cx - a, cy, cx - a - b, cy, cx - a - b - c, cy - d);
  cx -= a + b + c;
  cy -= d;

  // Arc: from (cx, cy) to (cx - arcSectionLength, cy - arcSectionLength)
  // Start tangent: (-c, -d) normalized (rotating 180° from top-right case)
  // End tangent: (-d, -c) normalized
  {
    const cp1x = cx + ctrlDist * (-t1x);
    const cp1y = cy + ctrlDist * (-t1y);
    const endX = cx - arcSectionLength;
    const endY = cy - arcSectionLength;
    const cp2x = endX - ctrlDist * (-t2x);
    const cp2y = endY - ctrlDist * (-t2y);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
    cx = endX;
    cy = endY;
  }

  ctx.bezierCurveTo(cx - d, cy - c, cx - d, cy - b - c, cx - d, cy - a - b - c);
  cx -= d;
  cy -= a + b + c;

  // Left edge to top-left
  ctx.lineTo(x, y + p);
  cx = x;
  cy = y + p;

  // === TOP-LEFT CORNER ===
  ctx.bezierCurveTo(cx, cy - a, cx, cy - a - b, cx + d, cy - a - b - c);
  cx += d;
  cy -= a + b + c;

  // Arc: from (cx, cy) to (cx + arcSectionLength, cy - arcSectionLength)
  // Start tangent: (d, -c) normalized (rotating 270° from top-right case)
  // End tangent: (c, -d) normalized
  {
    const cp1x = cx + ctrlDist * t2x;
    const cp1y = cy + ctrlDist * (-t2y);
    const endX = cx + arcSectionLength;
    const endY = cy - arcSectionLength;
    const cp2x = endX - ctrlDist * t1x;
    const cp2y = endY - ctrlDist * (-t1y);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
    cx = endX;
    cy = endY;
  }

  ctx.bezierCurveTo(cx + c, cy - d, cx + b + c, cy - d, cx + a + b + c, cy - d);

  ctx.closePath();
}

// Helper that picks the right path function based on settings
function smartRectPath(ctx, x, y, w, h, r, useSquircle, cornerSmoothing) {
  if (useSquircle && r > 0 && cornerSmoothing > 0) {
    squircleRectPath(ctx, x, y, w, h, r, cornerSmoothing);
  } else {
    roundRectPath(ctx, x, y, w, h, r);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFilename(name) {
  const raw = String(name == null ? "" : name).trim();
  // Replace control chars and reserved characters <>:"/\|?* with '-'
  const replaced = raw
    .replace(/[\u0000-\u001F\u007F<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ");
  // Collapse multiple dashes and trim dots at ends
  const collapsed = replaced.replace(/-{2,}/g, "-").replace(/^\.+|\.+$/g, "");
  const sliced = collapsed.slice(0, 60);
  return sliced || "element-screenshot";
}

function siblingIndex(el) {
  let i = 1;
  let p = el;
  while (p && p.previousElementSibling) {
    p = p.previousElementSibling;
    i++;
  }
  return i;
}

function nodeLabel(el) {
  if (!el) return "";
  const id = el.id ? "#" + el.id : "";
  const cls =
    el.className && typeof el.className === "string"
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "";
  const tag = el.tagName ? el.tagName.toLowerCase() : "node";
  const parentTag =
    el.parentElement && el.parentElement.tagName
      ? el.parentElement.tagName.toLowerCase()
      : "root";
  const idx = siblingIndex(el);
  return `${parentTag} > <${tag}${id}${cls}> [${idx}]`;
}

function hideCurrentElement() {
  const el = currentTarget;
  if (!el || !document.contains(el)) return false;
  const prevStyle = el.getAttribute("style");
  try {
    el.setAttribute("data-es-hidden", "1");
    el.style.setProperty("display", "none", "important");
    hiddenElements.push({
      el,
      prevStyle,
      hadStyleAttr: prevStyle !== null,
      label: nodeLabel(el),
    });
    return true;
  } catch (err) {
    console.warn("Element Snap: failed to hide element", err);
    return false;
  }
}

function restoreLastHidden() {
  const item = hiddenElements.pop();
  if (!item) return false;
  try {
    item.el.removeAttribute("data-es-hidden");
    if (item.hadStyleAttr) item.el.setAttribute("style", item.prevStyle);
    else item.el.removeAttribute("style");
    return true;
  } catch (err) {
    console.warn("Element Snap: failed to restore element", err);
    return false;
  }
}

function restoreHiddenAt(index) {
  const item = hiddenElements[index];
  if (!item) return false;
  try {
    item.el.removeAttribute("data-es-hidden");
    if (item.hadStyleAttr) item.el.setAttribute("style", item.prevStyle);
    else item.el.removeAttribute("style");
    hiddenElements.splice(index, 1);
    return true;
  } catch (err) {
    console.warn("Element Snap: failed to restore element at index", index, err);
    return false;
  }
}

function restoreAllHidden() {
  let ok = false;
  while (hiddenElements.length) {
    ok = restoreLastHidden() || ok;
  }
  return ok;
}

const onMouseDown = (e) => {
  if (!ACTIVE) return;
  // Ignore interactions on the panel region (events may re-target to host)
  if (panel) {
    const pr = panel.getBoundingClientRect();
    if (
      e.clientX >= pr.left &&
      e.clientX <= pr.right &&
      e.clientY >= pr.top &&
      e.clientY <= pr.bottom
    ) {
      return;
    }
  }
  const isCtrl = e.ctrlKey || e.metaKey;
  if (!isCtrl) return; // only on CTRL/CMD + click
  const el =
    LOCKED && currentTarget
      ? currentTarget
      : pickTargetFromPoint(e.clientX, e.clientY);
  if (!el) return;
  currentTarget = el;
  const r = el.getBoundingClientRect();
  currentRect = {
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
  // prevent page interaction for this click
  cleanupClickSuppression();
  SUPPRESS_NEXT_CLICK = true;
  clickSuppressHandler = (ev) => {
    if (SUPPRESS_NEXT_CLICK) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
    }
  };
  window.addEventListener("click", clickSuppressHandler, true);
  window.addEventListener("mouseup", clickSuppressHandler, true);
  window.addEventListener("mousedown", clickSuppressHandler, true);
  clickSuppressTimer = setTimeout(() => {
    cleanupClickSuppression();
  }, CLICK_SUPPRESS_MS);
  e.preventDefault();
  e.stopPropagation();
  captureFlow();
};

function ensureLockedTracking() {
  if (!LOCKED || !currentTarget) return;
  if (lockRaf) cancelAnimationFrame(lockRaf);
  lockRaf = requestAnimationFrame(() => {
    if (!document.contains(currentTarget)) return;
    const r = currentTarget.getBoundingClientRect();
    currentRect = {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
    positionUI(currentRect);
  });
}

function onKeyDown(e) {
  if (!ACTIVE) return;
  if (e.key === "l" || e.key === "L") {
    LOCKED = !LOCKED;
    if (LOCKED) {
      ensureLockedTracking();
    }
    renderPanel();
  }
  if (e.key === "Escape" && LOCKED) {
    LOCKED = false;
    renderPanel();
  }
  if (e.key === "h" || e.key === "H") {
    if (currentTarget) {
      const done = hideCurrentElement();
      if (done) {
        LOCKED = false;
        currentTarget = null;
        currentRect = null;
        hideUIForScroll();
        renderPanel();
      }
    }
  }
  if (e.key === "r" || e.key === "R") {
    if (e.shiftKey) restoreAllHidden();
    else restoreLastHidden();
    updateHiddenList();
  }
}

function getPanelStructureKey() {
  const isAlpha = supportsAlpha(settings.format);
  const showQuality = settings.format === "jpg" || settings.format === "webp";
  return `${settings.paddingMode}|${isAlpha}|${settings.paddingType}|${showQuality}`;
}

function updatePanelDynamicContent() {
  if (!panel) return;

  // Update lock button
  const lockBtn = panel.querySelector("#es-lock");
  if (lockBtn) {
    lockBtn.textContent = LOCKED ? "Locked" : "Lock";
    lockBtn.classList.toggle("primary", LOCKED);
  }

  // Update toggle button
  const toggleBtn = panel.querySelector("#es-toggle");
  if (toggleBtn) {
    toggleBtn.textContent = ACTIVE ? "Off" : "On";
  }

  // Update mode buttons
  const uniform = settings.paddingMode === "uniform";
  const modeU = panel.querySelector("#es-mode-u");
  const modeS = panel.querySelector("#es-mode-s");
  if (modeU) modeU.classList.toggle("primary", uniform);
  if (modeS) modeS.classList.toggle("primary", !uniform);

  // Update transparency buttons
  const isAlpha = supportsAlpha(settings.format);
  if (isAlpha) {
    const tBtn = panel.querySelector("#es-pad-t");
    const cBtn = panel.querySelector("#es-pad-c");
    if (tBtn) tBtn.classList.toggle("primary", settings.paddingType === "transparent");
    if (cBtn) cBtn.classList.toggle("primary", settings.paddingType === "colored");
  }

  updateHiddenList();
  applyPanelOpacity();
}

function renderPanel() {
  if (!currentRect) {
    if (panel) panel.style.display = "none";
    return;
  }

  const needsCreate = !panel;
  if (needsCreate) {
    panel = document.createElement("div");
    panel.id = "es-panel";
    panel.style.position = "fixed";
    panel.style.zIndex = String(Z_PANEL);
    panel.style.pointerEvents = "auto";
    panel.style.maxWidth = PANEL_W + "px";
    panel.style.willChange = "transform";
    panel.addEventListener("mousedown", (ev) => ev.stopPropagation(), true);
    ensureHost();
    shadowRoot.appendChild(panel);
  }

  // Ensure sticky position without jumping during lock/unlock
  ensurePanelPositionFromRect({
    x: currentRect.x - (Number(settings.captureMargin) || 0),
    y: currentRect.y - (Number(settings.captureMargin) || 0),
    width: currentRect.width + 2 * (Number(settings.captureMargin) || 0),
    height: currentRect.height + 2 * (Number(settings.captureMargin) || 0),
  });

  // Check if we can skip full rebuild
  const newStructureKey = getPanelStructureKey();
  if (!needsCreate && panelState === newStructureKey) {
    updatePanelDynamicContent();
    return;
  }
  panelState = newStructureKey;

  const isAlpha = supportsAlpha(settings.format);
  const uniform = settings.paddingMode === "uniform";
  const sides = settings.paddingSides || DEFAULTS.paddingSides;
  const hiddenCount = hiddenElements.length;

  // Build hidden list
  const hiddenList = hiddenElements
    .map((h, i) => {
      const raw = h.label || nodeLabel(h.el);
      const safe = escapeHtml(raw);
      return `<div class=\"row\" style=\"justify-content:space-between; align-items:center;\"><div class=\"muted\" style=\"white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 170px;\" title=\"${safe}\">${safe}</div><button class=\"btn\" data-es-unhide=\"${i}\">Unhide</button></div>`;
    })
    .join("");

  const perSideControls = `
    <div class="grid-2">
      <div>
        <label>Top: <span id="es-pt">${sides.top}px</span></label>
        <input id="es-pad-top" type="range" min="0" max="50" step="1" value="${sides.top}" />
      </div>
      <div>
        <label>Right: <span id="es-pr">${sides.right}px</span></label>
        <input id="es-pad-right" type="range" min="0" max="50" step="1" value="${sides.right}" />
      </div>
      <div>
        <label>Bottom: <span id="es-pb">${sides.bottom}px</span></label>
        <input id="es-pad-bottom" type="range" min="0" max="50" step="1" value="${sides.bottom}" />
      </div>
      <div>
        <label>Left: <span id="es-pl">${sides.left}px</span></label>
        <input id="es-pad-left" type="range" min="0" max="50" step="1" value="${sides.left}" />
      </div>
    </div>`;

  const transControls = isAlpha
    ? `<div class=\"row\" style=\"margin-top:6px;\">\n<button class=\"btn ${settings.paddingType === "transparent" ? "primary" : ""
    }\" id=\"es-pad-t\">Transparent</button>\n<button class=\"btn ${settings.paddingType === "colored" ? "primary" : ""
    }\" id=\"es-pad-c\">Colored</button>\n</div>\n${settings.paddingType === "colored"
      ? '<label>Padding Color</label><input id="es-pad-color" type="color" value="' +
      escapeHtml(settings.paddingColor) +
      '" />'
      : ""
    }`
    : `<div class=\"row\" style=\"margin-top:6px;\"><span class=\"muted\">Format has no transparency; using Background Color for export.</span></div>\n       <label style=\"margin-top:6px;\">Background Color</label>\n       <input id=\"es-pad-color\" type=\"color\" value=\"${escapeHtml(
      settings.paddingColor
    )}\" />`;

  panel.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content: space-between; margin-bottom:6px;">
        <strong>Screenshot Settings</strong>
        <div class="row">
          <button class="btn ${LOCKED ? "primary" : ""}" id="es-lock">${LOCKED ? "Locked" : "Lock"
    }</button>
          <button class="btn ghost" id="es-dim">${settings.panelOpacityLow ? "Opaque" : "Dim"
    }</button>
          <button class="btn ghost" id="es-toggle">${ACTIVE ? "Off" : "On"
    }</button>
        </div>
      </div>

      <label>Padding Mode</label>
      <div class="row">
        <button class="btn ${uniform ? "primary" : ""
    }" id="es-mode-u">Uniform</button>
        <button class="btn ${!uniform ? "primary" : ""
    }" id="es-mode-s">Per side</button>
      </div>

      ${uniform
      ? `<label>Padding: <span id=\"es-pad-label\">${settings.padding}px</span></label>
           <input id=\"es-pad\" type=\"range\" min=\"0\" max=\"50\" step=\"1\" value=\"${settings.padding}\" />`
      : `<label>Padding (px)</label>${perSideControls}`
    }

      <label style="margin-top:6px;">Capture Margin: <span id="es-cm-label">${settings.captureMargin
    }px</span></label>
      <input id="es-cm" type="range" min="0" max="200" step="2" value="${settings.captureMargin
    }" />

      ${transControls}

      <label style="margin-top:6px;">Rounded Corners: <span id="es-r-label">${settings.roundedRadius
    }px</span></label>
      <input id="es-r" type="range" min="0" max="48" step="1" value="${settings.roundedRadius
    }" />
      <div class="row" style="margin-top:6px; gap:8px;">
        <label class="checkbox-label">
          <input type="checkbox" id="es-squircle" ${settings.squircleRounding ? 'checked' : ''} />
          <span class="checkbox-custom"></span>
          <span class="muted">Smooth corners</span>
        </label>
      </div>
      ${settings.squircleRounding ? `
      <label style="margin-top:6px;">Smoothing: <span id="es-smooth-label">${Math.round(settings.cornerSmoothing * 100)}%</span></label>
      <input id="es-smooth" type="range" min="0" max="100" step="5" value="${Math.round(settings.cornerSmoothing * 100)}" />
      ` : ''}

      <label style="margin-top:6px;">Format</label>
      <select id="es-format">
        <option value="png" ${settings.format === "png" ? "selected" : ""
    }>PNG</option>
        <option value="webp" ${settings.format === "webp" ? "selected" : ""
    }>WEBP</option>
        <option value="jpg" ${settings.format === "jpg" ? "selected" : ""
    }>JPG</option>
        <option value="svg" ${settings.format === "svg" ? "selected" : ""
    }>SVG</option>
      </select>
      ${settings.format === "jpg" || settings.format === "webp"
      ? '<label>Quality: <span id="es-q-label">' +
      settings.quality +
      '%</span></label><input id="es-q" type="range" min="10" max="100" step="5" value="' +
      settings.quality +
      '" />'
      : ""
    }
      <label style="margin-top:6px;">Filename Prefix</label>
      <input id="es-name" type="text" value="${escapeHtml(
      settings.filenamePrefix
    )}" />

      <label style="margin-top:10px;">Clean up</label>
      <div class="muted">Hidden elements: <span id="es-hidden-count">${hiddenCount}</span> - Press <span class="kbd">H</span> to hide current, <span class="kbd">R</span> to restore last, <span class="kbd">Shift</span> + <span class="kbd">R</span> to restore all.</div>
      <div id="es-hidden-list" style="margin-top:6px; display:grid; gap:6px; max-height:160px; overflow:auto;">${hiddenList || '<div class="muted">No hidden elements yet.</div>'
    }</div>

      <div style="margin-top:8px; display:grid; gap:6px;">
        <div class="shortcut"><span class="kbd">Ctrl/Cmd</span><span>+</span><span class="kbd">Click</span><span class="muted">Capture</span></div>
        <div class="shortcut"><span class="kbd">L</span><span class="muted">Lock/Unlock</span></div>
        <div class="shortcut"><span class="kbd">Esc</span><span class="muted">Unlock</span></div>
      </div>
      <div class="row" style="margin-top:8px;">
        <button class="btn ghost" id="es-close">Close</button>
        <button class="btn primary" id="es-capture">Capture</button>
      </div>
    </div>`;

  // Wire interactions
  panel.querySelector("#es-toggle").onclick = () => setActiveSoft(!ACTIVE);
  panel.querySelector("#es-lock").onclick = () => {
    LOCKED = !LOCKED;
    if (LOCKED) ensureLockedTracking();
    setLockButtonState();
  };
  const dimBtn = panel.querySelector("#es-dim");
  if (dimBtn)
    dimBtn.onclick = () => {
      settings.panelOpacityLow = !settings.panelOpacityLow;
      persistSettings();
      applyPanelOpacity();
      dimBtn.textContent = settings.panelOpacityLow ? "Opaque" : "Dim";
    };

  // Mode
  const modeU = panel.querySelector("#es-mode-u");
  const modeS = panel.querySelector("#es-mode-s");
  if (modeU)
    modeU.onclick = () => {
      settings.paddingMode = "uniform";
      const p = settings.padding ?? 0;
      settings.paddingSides = { top: p, right: p, bottom: p, left: p };
      persistSettings();
      positionUI(currentRect);
      renderPanel();
    };
  if (modeS)
    modeS.onclick = () => {
      settings.paddingMode = "sides";
      persistSettings();
      positionUI(currentRect);
      renderPanel();
    };

  // Uniform
  const padEl = panel.querySelector("#es-pad");
  if (padEl)
    padEl.oninput = () => {
      const v = Number(padEl.value);
      settings.padding = v;
      settings.paddingSides = { top: v, right: v, bottom: v, left: v };
      panel.querySelector("#es-pad-label").textContent = v + "px";
      persistSettings();
      positionUI(currentRect);
    };

  // Sides
  const pt = panel.querySelector("#es-pad-top");
  const pr = panel.querySelector("#es-pad-right");
  const pb = panel.querySelector("#es-pad-bottom");
  const pl = panel.querySelector("#es-pad-left");
  if (pt)
    pt.oninput = () => {
      settings.paddingSides.top = Number(pt.value);
      panel.querySelector("#es-pt").textContent = pt.value + "px";
      persistSettings();
      positionUI(currentRect);
    };
  if (pr)
    pr.oninput = () => {
      settings.paddingSides.right = Number(pr.value);
      panel.querySelector("#es-pr").textContent = pr.value + "px";
      persistSettings();
      positionUI(currentRect);
    };
  if (pb)
    pb.oninput = () => {
      settings.paddingSides.bottom = Number(pb.value);
      panel.querySelector("#es-pb").textContent = pb.value + "px";
      persistSettings();
      positionUI(currentRect);
    };
  if (pl)
    pl.oninput = () => {
      settings.paddingSides.left = Number(pl.value);
      panel.querySelector("#es-pl").textContent = pl.value + "px";
      persistSettings();
      positionUI(currentRect);
    };

  // Transparency controls
  if (isAlpha) {
    const tBtn = panel.querySelector("#es-pad-t");
    const cBtn = panel.querySelector("#es-pad-c");
    if (tBtn)
      tBtn.onclick = () => {
        settings.paddingType = "transparent";
        persistSettings();
        positionUI(currentRect);
        renderPanel();
      };
    if (cBtn)
      cBtn.onclick = () => {
        settings.paddingType = "colored";
        persistSettings();
        positionUI(currentRect);
        renderPanel();
      };
  }

  const colorEl = panel.querySelector("#es-pad-color");
  if (colorEl)
    colorEl.oninput = () => {
      settings.paddingColor = colorEl.value;
      persistSettings();
      positionUI(currentRect);
    };

  const fmtEl = panel.querySelector("#es-format");
  fmtEl.onchange = () => {
    settings.format = fmtEl.value;
    persistSettings();
    positionUI(currentRect);
    renderPanel();
  };

  const qEl = panel.querySelector("#es-q");
  if (qEl)
    qEl.oninput = () => {
      settings.quality = Number(qEl.value);
      panel.querySelector("#es-q-label").textContent = settings.quality + "%";
      persistSettings();
    };
  const rEl = panel.querySelector("#es-r");
  if (rEl)
    rEl.oninput = () => {
      settings.roundedRadius = Math.max(0, Number(rEl.value) || 0);
      const lbl = panel.querySelector("#es-r-label");
      if (lbl) lbl.textContent = settings.roundedRadius + "px";
      persistSettings();
      if (currentRect) positionUI(currentRect);
    };

  // Squircle controls
  const squircleEl = panel.querySelector("#es-squircle");
  if (squircleEl)
    squircleEl.onchange = () => {
      settings.squircleRounding = squircleEl.checked;
      persistSettings();
      if (currentRect) positionUI(currentRect);
      renderPanel(); // Re-render to show/hide smoothing slider
    };

  const smoothEl = panel.querySelector("#es-smooth");
  if (smoothEl)
    smoothEl.oninput = () => {
      settings.cornerSmoothing = Math.max(0, Math.min(1, Number(smoothEl.value) / 100));
      const lbl = panel.querySelector("#es-smooth-label");
      if (lbl) lbl.textContent = Math.round(settings.cornerSmoothing * 100) + "%";
      persistSettings();
      if (currentRect) positionUI(currentRect);
    };
  const cmEl = panel.querySelector("#es-cm");
  if (cmEl)
    cmEl.oninput = () => {
      settings.captureMargin = Number(cmEl.value);
      const lbl = panel.querySelector("#es-cm-label");
      if (lbl) lbl.textContent = settings.captureMargin + "px";
      persistSettings();
      positionUI(currentRect);
    };
  const nameEl = panel.querySelector("#es-name");
  nameEl.oninput = () => {
    settings.filenamePrefix = nameEl.value;
    persistSettings();
  };
  panel.querySelector("#es-capture").onclick = () => captureFlow();
  const closeBtn = panel.querySelector("#es-close");
  if (closeBtn)
    closeBtn.onclick = () => {
      chrome.runtime.sendMessage({ type: "SET_ACTIVE", active: false });
    };

  updateHiddenList();
  applyPanelOpacity();
}

function applyPanelOpacity() {
  if (!panel) return;
  const low = !!settings.panelOpacityLow;
  panel.style.opacity = low ? "0.1" : "1";
}

function setLockButtonState() {
  if (!panel) return;
  const btn = panel.querySelector("#es-lock");
  if (!btn) return;
  btn.textContent = LOCKED ? "Locked" : "Lock";
  if (LOCKED) btn.classList.add("primary");
  else btn.classList.remove("primary");
}

function updateHiddenList() {
  if (!panel) return;
  const container = panel.querySelector("#es-hidden-list");
  const count = panel.querySelector("#es-hidden-count");
  if (count) count.textContent = String(hiddenElements.length);
  if (!container) return;
  const html = hiddenElements
    .map((h, i) => {
      const raw = h.label || nodeLabel(h.el);
      const safe = escapeHtml(raw);
      return `<div class=\"row\" style=\"justify-content:space-between; align-items:center;\"><div class=\"muted\" style=\"white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 170px;\" title=\"${safe}\">${safe}</div><button class=\"btn\" data-es-unhide=\"${i}\">Unhide</button></div>`;
    })
    .join("");
  container.innerHTML =
    html || '<div class="muted">No hidden elements yet.</div>';
  const unhideBtns = container.querySelectorAll("[data-es-unhide]");
  unhideBtns.forEach((btn) => {
    btn.addEventListener(
      "click",
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const idx = Number(btn.getAttribute("data-es-unhide"));
        restoreHiddenAt(idx);
        updateHiddenList();
      },
      { passive: false }
    );
  });
}

function waitFrames(n = 2) {
  return new Promise((r) => {
    function f(i) {
      if (i <= 0) return r();
      requestAnimationFrame(() => f(i - 1));
    }
    f(n);
  });
}

function detachUI() {
  const parent = host && host.parentNode ? host.parentNode : null;
  const removed = [];
  if (host && parent) {
    parent.removeChild(host);
    removed.push("host");
  }
  return { removed, root: parent };
}

function reattachUI(ctx) {
  if (!ctx) return;
  const parent = ctx.root || document.body || document.documentElement;
  if (ctx.removed?.includes("host") && host) parent.appendChild(host);
}

function getPadsPx(dpr) {
  if (settings.paddingMode === "sides") {
    const s = settings.paddingSides || DEFAULTS.paddingSides;
    return {
      l: Math.floor((Number(s.left) || 0) * dpr),
      r: Math.floor((Number(s.right) || 0) * dpr),
      t: Math.floor((Number(s.top) || 0) * dpr),
      b: Math.floor((Number(s.bottom) || 0) * dpr),
    };
  }
  const p = Math.floor((Number(settings.padding) || 0) * dpr);
  return { l: p, r: p, t: p, b: p };
}

/**
 * Get element's bounding rect relative to the document (not viewport).
 * Returns { x, y, width, height } in document coordinates.
 */
function getElementDocumentRect(element) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + window.scrollX,
    y: rect.top + window.scrollY,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Calculate the grid of tiles needed to capture the full element.
 * Each tile represents one screenshot region.
 * @param {Object} elementRect - Element rect in document coordinates
 * @param {Object} viewportSize - { width, height } of viewport
 * @returns {Object} Object with tiles array and captureRect
 */
function calculateTiles(elementRect, viewportSize) {
  const tiles = [];
  const margin = Number(settings.captureMargin) || 0;

  // Expand element rect by capture margin
  const captureRect = {
    x: elementRect.x - margin,
    y: elementRect.y - margin,
    width: elementRect.width + margin * 2,
    height: elementRect.height + margin * 2,
  };

  // Each tile is viewport-sized
  const tileStepX = viewportSize.width;
  const tileStepY = viewportSize.height;

  // Calculate number of tiles needed
  const cols = Math.ceil(captureRect.width / tileStepX);
  const rows = Math.ceil(captureRect.height / tileStepY);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const docX = captureRect.x + col * tileStepX;
      const docY = captureRect.y + row * tileStepY;

      // Calculate actual tile dimensions (may be smaller at edges)
      const tileWidth = Math.min(viewportSize.width, captureRect.x + captureRect.width - docX);
      const tileHeight = Math.min(viewportSize.height, captureRect.y + captureRect.height - docY);

      tiles.push({
        docX,
        docY,
        width: tileWidth,
        height: tileHeight,
        col,
        row,
      });
    }
  }

  return { tiles, cols, rows, captureRect };
}

/**
 * Capture a large element by taking multiple screenshots and stitching them together.
 */
async function captureStitched(elementRect, viewportSize) {
  const dpr = window.devicePixelRatio || 1;
  const margin = Math.floor((Number(settings.captureMargin) || 0) * dpr);
  const pad = getPadsPx(dpr);

  // Calculate tiles needed
  const { tiles, captureRect } = calculateTiles(elementRect, viewportSize);

  // Save current scroll position
  const savedScrollX = window.scrollX;
  const savedScrollY = window.scrollY;

  // Capture all tiles
  const tileImages = [];

  try {
    for (const tile of tiles) {
      // Scroll to position this tile at the top-left of the viewport
      window.scrollTo({
        left: tile.docX,
        top: tile.docY,
        behavior: 'instant',
      });

      // Wait for scroll and paint to settle
      await new Promise(r => setTimeout(r, SCROLL_INTO_VIEW_MS));
      await waitFrames(2);
      await new Promise(r => setTimeout(r, FRAME_SETTLE_MS));

      // Detach UI
      const ctx = detachUI();
      await waitFrames(2);
      await new Promise(r => setTimeout(r, FRAME_SETTLE_MS));

      // Capture screenshot
      const cap = await withTimeout(
        new Promise((resolve) =>
          chrome.runtime.sendMessage({ type: "CAPTURE" }, resolve)
        ),
        CAPTURE_TIMEOUT_MS
      );

      // Reattach UI
      reattachUI(ctx);

      if (!cap?.ok) throw new Error(cap?.error || "CAPTURE_FAILED");

      const image = await createImageFromDataURL(cap.dataUrl);

      // Calculate the region within this screenshot that we need
      // The element portion starts at (0, 0) since we scrolled to position it there
      const cropX = 0;
      const cropY = 0;
      const cropWidth = Math.min(tile.width * dpr, image.width);
      const cropHeight = Math.min(tile.height * dpr, image.height);

      tileImages.push({
        image,
        tile,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        // Position in final stitched canvas (document position relative to captureRect)
        destX: (tile.docX - captureRect.x) * dpr,
        destY: (tile.docY - captureRect.y) * dpr,
      });
    }
  } finally {
    // Restore original scroll position
    window.scrollTo({
      left: savedScrollX,
      top: savedScrollY,
      behavior: 'instant',
    });
    await new Promise(r => setTimeout(r, SCROLL_INTO_VIEW_MS));
  }

  // Create stitched canvas
  const stitchedWidth = Math.ceil(captureRect.width * dpr);
  const stitchedHeight = Math.ceil(captureRect.height * dpr);

  const canvas = document.createElement("canvas");
  canvas.width = stitchedWidth + pad.l + pad.r;
  canvas.height = stitchedHeight + pad.t + pad.b;
  const ctx2 = canvas.getContext("2d");

  // Apply clipping for rounded corners
  const isAlpha = supportsAlpha(settings.format);
  const rr = Math.max(0, Number(settings.roundedRadius) || 0);
  const useSquircle = !!settings.squircleRounding;
  const smoothing = Math.max(0, Math.min(1, Number(settings.cornerSmoothing) || 0.6));
  const applyClip = rr > 0;

  if (applyClip) {
    ctx2.save();
    const r = Math.min(rr, Math.floor(Math.min(canvas.width, canvas.height) / 2));
    ctx2.beginPath();
    smartRectPath(ctx2, 0, 0, canvas.width, canvas.height, r, useSquircle, smoothing);
    ctx2.clip();
  }

  // Clear canvas
  ctx2.clearRect(0, 0, canvas.width, canvas.height);

  // Draw each tile at its position
  for (const ti of tileImages) {
    ctx2.drawImage(
      ti.image,
      ti.cropX,
      ti.cropY,
      ti.cropWidth,
      ti.cropHeight,
      pad.l + ti.destX,
      pad.t + ti.destY,
      ti.cropWidth,
      ti.cropHeight
    );
  }

  // Handle padding fill (similar to single capture)
  const outer = { x: 0, y: 0, w: canvas.width, h: canvas.height };
  const marginRect = { x: pad.l, y: pad.t, w: stitchedWidth, h: stitchedHeight };
  const contentRect = {
    x: pad.l + margin,
    y: pad.t + margin,
    w: Math.max(0, stitchedWidth - margin * 2),
    h: Math.max(0, stitchedHeight - margin * 2),
  };

  const rOuter = Math.min(rr, Math.floor(Math.min(outer.w, outer.h) / 2));
  const rMargin = Math.min(rr, Math.floor(Math.min(marginRect.w, marginRect.h) / 2));
  const rContent = Math.min(rr, Math.floor(Math.min(contentRect.w, contentRect.h) / 2));

  const fillColor = settings.paddingColor || "#ffffff";

  // Padding ring: outer - margin
  if (pad.l + pad.r + pad.t + pad.b > 0) {
    if (settings.paddingType === "colored" || !isAlpha) {
      ctx2.beginPath();
      smartRectPath(ctx2, outer.x, outer.y, outer.w, outer.h, rOuter, useSquircle, smoothing);
      smartRectPath(ctx2, marginRect.x, marginRect.y, marginRect.w, marginRect.h, rMargin, useSquircle, smoothing);
      ctx2.fillStyle = fillColor;
      ctx2.fill("evenodd");
    }
  }

  // Margin ring: if captureMargin > 0 and paddingType is colored
  if (margin > 0 && (settings.paddingType === "colored" || !isAlpha)) {
    ctx2.beginPath();
    smartRectPath(ctx2, marginRect.x, marginRect.y, marginRect.w, marginRect.h, rMargin, useSquircle, smoothing);
    smartRectPath(ctx2, contentRect.x, contentRect.y, contentRect.w, contentRect.h, rContent, useSquircle, smoothing);
    ctx2.fillStyle = fillColor;
    ctx2.fill("evenodd");
  }

  if (applyClip) {
    ctx2.restore();
  }

  // Export
  let dataUrl, ext;
  if (settings.format === "svg") {
    const raster = canvas.toDataURL("image/png");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><image href="${raster}" width="${canvas.width}" height="${canvas.height}"/></svg>`;
    dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    ext = "svg";
  } else {
    const mime =
      settings.format === "jpg"
        ? "image/jpeg"
        : settings.format === "webp"
          ? "image/webp"
          : "image/png";
    const quality = (settings.quality || 90) / 100;
    dataUrl = canvas.toDataURL(mime, quality);
    ext =
      settings.format === "jpg"
        ? "jpg"
        : settings.format === "webp"
          ? "webp"
          : "png";
  }

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const prefixSafe = sanitizeFilename(settings.filenamePrefix || "element-screenshot");
  const filename = `${prefixSafe}-${ts}.${ext}`;

  await withTimeout(
    new Promise((resolve) =>
      chrome.runtime.sendMessage({ type: "DOWNLOAD", dataUrl, filename }, resolve)
    ),
    CAPTURE_TIMEOUT_MS
  );
}

async function captureFlow() {
  try {
    if (!currentTarget || !document.contains(currentTarget)) return;

    // Get element rect in document coordinates to check if it needs stitching
    const elementDocRect = getElementDocumentRect(currentTarget);
    const viewportSize = { width: window.innerWidth, height: window.innerHeight };
    const margin = Number(settings.captureMargin) || 0;

    // Check if element (with margin) exceeds viewport dimensions
    const totalWidth = elementDocRect.width + margin * 2;
    const totalHeight = elementDocRect.height + margin * 2;
    const needsStitching = totalWidth > viewportSize.width || totalHeight > viewportSize.height;

    if (needsStitching) {
      // Use multi-screenshot stitching for large elements
      await captureStitched(elementDocRect, viewportSize);
      return;
    }

    // Single screenshot capture for elements that fit in viewport
    currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
    await new Promise((r) => setTimeout(r, SCROLL_INTO_VIEW_MS));
    const r = currentTarget.getBoundingClientRect();
    currentRect = {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };

    // Detach UI to guarantee it won't appear in capture
    const ctx = detachUI();
    await waitFrames(2);
    await new Promise((r) => setTimeout(r, FRAME_SETTLE_MS));

    const dpr = window.devicePixelRatio || 1;
    const cap = await withTimeout(
      new Promise((resolve) =>
        chrome.runtime.sendMessage({ type: "CAPTURE" }, resolve)
      ),
      CAPTURE_TIMEOUT_MS
    );

    reattachUI(ctx);

    if (!cap?.ok) throw new Error(cap?.error || "CAPTURE_FAILED");

    const image = await createImageFromDataURL(cap.dataUrl);
    const canvas = document.createElement("canvas");
    const targetW = Math.max(1, Math.floor(currentRect.width * dpr));
    const targetH = Math.max(1, Math.floor(currentRect.height * dpr));
    const marginPx = Math.max(
      0,
      Math.floor((Number(settings.captureMargin) || 0) * dpr)
    );
    const pad = getPadsPx(dpr);
    // Compute crop rect with margin and clamp to captured image bounds
    const rawSx = Math.floor(currentRect.x * dpr) - marginPx;
    const rawSy = Math.floor(currentRect.y * dpr) - marginPx;
    const rawSW = targetW + marginPx * 2;
    const rawSH = targetH + marginPx * 2;
    const sx = Math.max(0, rawSx);
    const sy = Math.max(0, rawSy);
    const sWidth = Math.min(
      rawSW - (sx - rawSx),
      Math.max(0, image.width - sx)
    );
    const sHeight = Math.min(
      rawSH - (sy - rawSy),
      Math.max(0, image.height - sy)
    );

    canvas.width = sWidth + pad.l + pad.r;
    canvas.height = sHeight + pad.t + pad.b;
    const ctx2 = canvas.getContext("2d");

    const isAlpha = supportsAlpha(settings.format);
    const rr = Math.max(0, Number(settings.roundedRadius) || 0);
    const useSquircle = !!settings.squircleRounding;
    const smoothing = Math.max(0, Math.min(1, Number(settings.cornerSmoothing) || 0.6));
    const applyClip = rr > 0;
    if (applyClip) {
      ctx2.save();
      const r = Math.min(
        rr,
        Math.floor(Math.min(canvas.width, canvas.height) / 2)
      );
      const x = 0,
        y = 0,
        w = canvas.width,
        h = canvas.height;
      ctx2.beginPath();
      smartRectPath(ctx2, x, y, w, h, r, useSquircle, smoothing);
      ctx2.clip();
    }

    // Always start with a cleared canvas inside the outer clip
    ctx2.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the captured content first
    ctx2.drawImage(
      image,
      sx,
      sy,
      sWidth,
      sHeight,
      pad.l,
      pad.t,
      sWidth,
      sHeight
    );

    // Compute rects for ring fills
    const outer = { x: 0, y: 0, w: canvas.width, h: canvas.height };
    const marginRect = { x: pad.l, y: pad.t, w: sWidth, h: sHeight };
    const trimLeft = Math.max(0, sx - rawSx);
    const trimTop = Math.max(0, sy - rawSy);
    const trimRight = Math.max(0, rawSW - trimLeft - sWidth);
    const trimBottom = Math.max(0, rawSH - trimTop - sHeight);
    const mLeft = Math.max(0, marginPx - trimLeft);
    const mTop = Math.max(0, marginPx - trimTop);
    const mRight = Math.max(0, marginPx - trimRight);
    const mBottom = Math.max(0, marginPx - trimBottom);
    const contentRect = {
      x: marginRect.x + mLeft,
      y: marginRect.y + mTop,
      w: Math.max(0, marginRect.w - mLeft - mRight),
      h: Math.max(0, marginRect.h - mTop - mBottom),
    };

    const rOuter = Math.min(rr, Math.floor(Math.min(outer.w, outer.h) / 2));
    const rMargin = Math.min(
      rr,
      Math.floor(Math.min(marginRect.w, marginRect.h) / 2)
    );
    const rContent = Math.min(
      rr,
      Math.floor(Math.min(contentRect.w, contentRect.h) / 2)
    );

    const fillColor = settings.paddingColor || "#ffffff";

    // Padding ring: outer - margin
    if (pad.l + pad.r + pad.t + pad.b > 0) {
      if (settings.paddingType === "colored" || !isAlpha) {
        ctx2.beginPath();
        smartRectPath(ctx2, outer.x, outer.y, outer.w, outer.h, rOuter, useSquircle, smoothing);
        smartRectPath(
          ctx2,
          marginRect.x,
          marginRect.y,
          marginRect.w,
          marginRect.h,
          rMargin,
          useSquircle,
          smoothing
        );
        ctx2.fillStyle = fillColor;
        ctx2.fill("evenodd");
      } else {
        // transparent: nothing to draw for padding band
      }
    }

    if (applyClip) {
      ctx2.restore();
    }

    let dataUrl, ext;
    if (settings.format === "svg") {
      const raster = canvas.toDataURL("image/png");
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><image href="${raster}" width="${canvas.width}" height="${canvas.height}"/></svg>`;
      dataUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      ext = "svg";
    } else {
      const mime =
        settings.format === "jpg"
          ? "image/jpeg"
          : settings.format === "webp"
            ? "image/webp"
            : "image/png";
      const quality = (settings.quality || 90) / 100;
      dataUrl = canvas.toDataURL(mime, quality);
      ext =
        settings.format === "jpg"
          ? "jpg"
          : settings.format === "webp"
            ? "webp"
            : "png";
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const prefixSafe = sanitizeFilename(
      settings.filenamePrefix || "element-screenshot"
    );
    const filename = `${prefixSafe}-${ts}.${ext}`;
    await withTimeout(
      new Promise((resolve) =>
        chrome.runtime.sendMessage(
          { type: "DOWNLOAD", dataUrl, filename },
          resolve
        )
      ),
      CAPTURE_TIMEOUT_MS
    );
  } catch (err) {
    console.warn("Element Shot error:", err);
  }
}

function createImageFromDataURL(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function onUrlChange() {
  // Close extension when URL changes - the selected element doesn't exist on the new page
  if (ACTIVE && lastKnownUrl && location.href !== lastKnownUrl) {
    disable();
    chrome.runtime.sendMessage({ type: "SET_ACTIVE", active: false }).catch(() => { });
  }
}

// Wrap History API to detect SPA navigations (pushState/replaceState don't trigger popstate)
let historyWrapped = false;
function wrapHistoryApi() {
  if (historyWrapped) return;
  historyWrapped = true;

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args);
    onUrlChange();
    return result;
  };

  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args);
    onUrlChange();
    return result;
  };
}

function onToggleMessage(active) {
  if (active) enable();
  else disable();
}

async function enable() {
  ACTIVE = true;
  lastKnownUrl = location.href;
  wrapHistoryApi(); // Intercept History API for SPA navigation detection
  await loadSettings();
  ensureOverlay();
  window.addEventListener("mousemove", onMouseMove, {
    capture: true,
    passive: true,
  });
  window.addEventListener("mousedown", onMouseDown, { capture: true });
  window.addEventListener("keydown", onKeyDown, { capture: true });
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  document.addEventListener("scroll", onScroll, {
    capture: true,
    passive: true,
  });
  window.addEventListener("resize", onResize);
  window.addEventListener("popstate", onUrlChange);
  window.addEventListener("hashchange", onUrlChange);
}

function disable() {
  ACTIVE = false;
  LOCKED = false;
  lastKnownUrl = null;
  currentTarget = null;
  currentRect = null;
  cleanupClickSuppression();
  window.removeEventListener("mousemove", onMouseMove, { capture: true });
  window.removeEventListener("mousedown", onMouseDown, { capture: true });
  window.removeEventListener("keydown", onKeyDown, { capture: true });
  window.removeEventListener("scroll", onScroll, { capture: true });
  document.removeEventListener("scroll", onScroll, { capture: true });
  window.removeEventListener("resize", onResize);
  window.removeEventListener("popstate", onUrlChange);
  window.removeEventListener("hashchange", onUrlChange);
  removeOverlay();
}

function setActiveSoft(nextActive) {
  if (nextActive) {
    ACTIVE = true;
    ensureOverlay();
    if (overlay) overlay.style.display = "block";
    if (currentRect) positionUI(currentRect);
  } else {
    ACTIVE = false;
    LOCKED = false;
    if (overlay) overlay.style.display = "none";
    if (box) box.style.display = "none";
    if (padMask) padMask.style.display = "none";
    if (panel) panel.style.display = "block";
  }
  renderPanel();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "TOGGLE") {
    onToggleMessage(!!msg.active);
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === "PING") {
    sendResponse({ ok: true });
    return true;
  }
});

chrome.runtime.sendMessage({ type: "GET_ACTIVE" }, (res) => {
  if (res?.active) enable();
});
