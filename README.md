# Element Snap

<div align="center">
    <img src="./assets/logo.png" alt="icon" width="150" />
</div>

<div align="center" style="margin-bottom: 2.5rem;">
    <span style="font-size: 2.5rem;">
      <b><strong style="font-size: 5rem;">Element Snap</strong></b>
      <br>"A lightweight, reliable Chrome extension<br>to capture pixel-perfect screenshots of any HTML element."
    </span>
</div>

<div align="center">
  <img src="./assets/extension-light.png" alt="Extension Light" width="45%" />
  <img src="./assets/extension-dark.png" alt="Extension Dark" width="45%" />
  <br/>
  <img src="./assets/options-light.png" alt="Options Light" width="45%" />
  <img src="./assets/options-dark.png" alt="Options Dark" width="45%" />
</div>

## Why Element Snap?

Unlike other extensions that re-render HTML to an image (often breaking styles), Element Snap takes a screenshot of the visible page. This guarantees that what you see is *exactly* what you get.

This approach is:
* **Reliable:** Preserves 100% of the element's styling, layout, and fonts.
* **Lightweight:** Built with zero libraries-, just vanilla JavaScript and the Chrome API for maximum speed.

> The only trade-off is that the element must be fully visible in the viewport to be captured.

## Features

* **Pixel-Perfect Capture:** Get a flawless image of any hovered element.
* **Live Padding Controls:** Add uniform or per-side padding with a real-time preview.
* **Flexible Output:** Save as PNG, JPG, WEBP, or SVG. Adjust quality for lossy formats.
* **Element Hiding:** Temporarily hide surrounding elements with a keypress (`H`) for a clean shot.
* **Keyboard Shortcuts:** Capture (`Ctrl/Cmd+Click`), lock focus (`L`), and more for a fast workflow.

## How to Use

1.  **Activate:** Click the extension icon in your toolbar to turn it on for the current tab.
2.  **Hover:** Move your mouse to highlight the desired element.
3.  **Adjust:** Use the floating panel to change padding, format, and other settings.
4.  **Capture:** `Ctrl/Cmd + Click` the element or press the "Capture" button.

## Installation

**1. From Chrome Web Store (Recommended)**

[chromewebstore.google.com](https://chromewebstore.google.com/detail/element-snap/nldbbahmckpcjcbikdaopeaiidhdomkf)

**2. From Source**

1.  Clone this repository: `git clone https://github.com/jonasfroeller/element-snap.git`
2.  Open Chrome and navigate to `chrome://extensions`.
3.  Enable "Developer mode" in the top-right corner.
4.  Click "Load unpacked" and select the cloned repository folder.

## Privacy & Permissions

- Uses `activeTab` and `scripting` to inject the UI only on demand when you click the extension action.
- Uses `tabs.captureVisibleTab` to screenshot the visible area of the current window; no network transmission occurs.
- Uses `storage.sync` to save UI preferences (padding, format, etc.).
- Uses `downloads` to save images to your device without additional prompts.

No analytics, tracking, or external requests. All processing happens locally in your browser.

## License

This project is licensed under the GPLv3 License. See the `LICENSE` file for details.

Copyright © 2025 Jonas Fröller
