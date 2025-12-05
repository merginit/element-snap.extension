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
    } catch (e) {}
  }
}

chrome.action.onClicked.addListener((tab) => {
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
      } catch (_) {}
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
          } catch (_) {}
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
