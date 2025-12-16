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

/**
 * Handles activation per-tab, content injection, tab capture, and downloads.
 */

const tabStates = new Map(); // tabId -> { active: boolean }

/**
 * Rigorously checks if a URL is restricted for Chrome Extensions (Manifest V3).
 * @param {string} url - The URL to check.
 * @returns {boolean} True if the extension cannot/should not run here.
 */
function isRestrictedUrl(url) {
  if (!url) return true; // Undefined URLs (like pre-loading tabs) are unsafe

  try {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol;
    const hostname = urlObj.hostname;

    // 1. STRICTLY FORBIDDEN SCHEMES
    // These grant high-level system access or internal browser control.
    const forbiddenSchemes = [
      "chrome:",
      "chrome-untrusted:", // Print preview / PDF sandboxes
      "chrome-search:",    // Google New Tab Page
      "chrome-signin:",    // Browser sign-in flows
      "chrome-error:",     // Network errors
      "chrome-native:",
      "about:",            // about:settings, about:policy (except about:blank sometimes)
      "view-source:",      // Source code view
      "devtools:",         // Developer tools
    ];

    if (forbiddenSchemes.some(scheme => protocol === scheme)) {
      return true;
    }

    // 2. PROTECTED WEB STORES
    // Scripts are blocked here to prevent review manipulation or malware installation.
    const protectedDomains = [
      "chromewebstore.google.com",
      "chrome.google.com",         // Legacy Web Store paths
    ];

    if (protectedDomains.some(d => hostname === d || hostname.endsWith("." + d))) {
      return true;
    }

    // 3. CROSS-EXTENSION RESTRICTION
    // You cannot run scripts inside other extensions' pages.
    if (protocol === "chrome-extension:") {
      // If we are in an extension context, we can check if this URL belongs to US.
      // If chrome.runtime.id is available, we check against it.
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.id) {
        return hostname !== chrome.runtime.id;
      }
      // If we can't check the ID, assume it's restricted to be safe.
      return true;
    }

    // 4. CONFIGURABLE RESTRICTIONS
    // "file:" is usually blocked unless the user manually enabled it.
    if (protocol === "file:") {
      return true;
    }

    return false;

  } catch (_) {
    // If URL parsing fails, it's likely a pseudo-protocol (like "javascript:") 
    // or malformed, so we treat it as restricted.
    return true;
  }
}

function setActiveBadge(tabId, active) {
  chrome.action.setBadgeText({ tabId, text: active ? "ON" : "" });
  if (active)
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#4F46E5" });
}

async function ensureInjected(tabId) {
  if (tabId == null) return false;
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: "PING" });
    return !!res;
  } catch (_) {
    // Not injected - programmatically inject content.js
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["shared.js", "content.js"],
      });
      await new Promise((r) => setTimeout(r, 80));
      return true;
    } catch (e) {
      console.warn("Injection failed:", e);
      return false;
    }
  }
}

async function toggleForTab(tabId) {
  if (tabId == null) return;
  const state = tabStates.get(tabId) || { active: false };
  const next = { active: !state.active };
  tabStates.set(tabId, next);
  setActiveBadge(tabId, next.active);

  const ok = await ensureInjected(tabId);
  if (ok) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: "TOGGLE",
        active: next.active,
      });
    } catch (_) { }
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (isRestrictedUrl(tab?.url)) {
    // Show "N/A" badge briefly to indicate extension cannot run here
    const tabId = tab?.id;
    if (tabId != null) {
      chrome.action.setBadgeText({ tabId, text: "N/A" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#DC2626" });
      setTimeout(() => {
        chrome.action.setBadgeText({ tabId, text: "" });
      }, 2000);
    }
    return;
  }
  toggleForTab(tab?.id);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabStates.delete(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status === "complete" && tabStates.get(tabId)?.active) {
    const ok = await ensureInjected(tabId);
    if (ok) {
      try {
        await chrome.tabs.sendMessage(tabId, { type: "TOGGLE", active: true });
      } catch (_) { }
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_ACTIVE") {
    const tabId = sender?.tab?.id;
    const active = tabId ? tabStates.get(tabId)?.active || false : false;
    sendResponse({ active });
    return true;
  }

  if (message?.type === "SET_ACTIVE") {
    (async () => {
      try {
        const tabId = sender?.tab?.id;
        if (tabId == null) return sendResponse({ ok: false, error: "NO_TAB" });
        const active = !!message.active;
        tabStates.set(tabId, { active });
        setActiveBadge(tabId, active);
        const ok = await ensureInjected(tabId);
        if (ok) {
          try {
            await chrome.tabs.sendMessage(tabId, { type: "TOGGLE", active });
          } catch (_) { }
        }
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  if (message?.type === "CAPTURE") {
    (async () => {
      try {
        const windowId = sender?.tab?.windowId;
        if (windowId == null)
          return sendResponse({ ok: false, error: "NO_TAB" });
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
          format: "png",
        });
        sendResponse({ ok: true, dataUrl });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true; // async
  }

  if (message?.type === "DOWNLOAD") {
    (async () => {
      try {
        await chrome.downloads.download({
          url: message.dataUrl,
          filename: message.filename,
          saveAs: false,
        });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }
});
