# Changelog

All notable changes to this project will be documented in this file.

## [0.2.3] - 2025-12-16
- Fix "Extension context invalidated" error spam when extension is reloaded
- State sync interval now stops itself when extension context is lost

## [0.2.2] - 2025-12-16
- Auto-close extension UI when navigating to a new page
- Background script now deactivates on tab navigation (selected element doesn't exist on new page)
- Add state sync polling to clean up orphaned UI elements

## [0.2.1] - 2025-12-16
- Fix inner paths losing rounded corners at certain padding/margin sizes when squircle mode enabled
- Add guards to gracefully fall back to standard rounded corners when squircle parameters become degenerate

## [0.2.0] - 2025-12-16
- Add full element capture for elements larger than the viewport
- Automatically detect when element exceeds visible screen area
- Take multiple screenshots and stitch them together seamlessly

## [0.1.27] - 2025-12-16
- Add optional squircle (smooth corners) rounding mode based on Figma's corner smoothing algorithm
- New "Smooth corners" checkbox in both settings panel and options page
- Adjustable corner smoothing slider (0-100%) when squircle mode is enabled
- Smoother, more iOS/macOS-like corners compared to standard CSS border-radius
- Fix options page changes not immediately updating the live preview

## [0.1.26] - 2025-12-16
- Fix extension showing "active" status on restricted pages where content scripts cannot run
- Add rigorous 4-layer URL restriction detection:
  - Forbidden schemes (chrome://, chrome-untrusted://, chrome-search://, chrome-signin://, about:, view-source:, devtools://)
  - Protected Web Store domains (Chrome Web Store)
  - Cross-extension restriction (prevents injection into other extensions' pages)
  - Configurable restrictions (file:// protocol)
- Show temporary red "N/A" badge when clicking extension on restricted pages

## [0.1.25] - 2025-12-15
- Complete UI design overhaul
- Add light/dark theme support with system preference detection
- Add theme toggle (Light/Dark/System) in Options page
- Use CSS custom properties for consistent theming across options page and content panel
- Improve visual design: rounded corners, styled range sliders, better typography, smooth transitions

## [0.1.24] - 2025-12-05
- Add German locale strings for extension UI metadata

## [0.1.23] - 2025-12-05
- Extract DEFAULTS and migrateSettings into shared.js to eliminate code duplication

## [0.1.22] - 2025-12-05
- Fix css tagged template function not interpolating z-index values

## [0.1.21] - 2025-12-05
- Remove unused variable and function, consolidate duplicate roundRectPath

## [0.1.20] - 2025-12-05
- Fix hidden elements list not updating when using R key to restore

## [0.1.19] - 2025-12-05
- Add element existence check before capture to handle removed DOM elements

## [0.1.18] - 2025-12-05
- Optimize panel rendering to skip full rebuild when only dynamic content changes

## [0.1.17] - 2025-12-05
- Extract magic numbers into named constants for better maintainability

## [0.1.16] - 2025-12-05
- Log warnings instead of silently swallowing errors in catch blocks

## [0.1.15] - 2025-12-05
- Add 5s timeout to capture and download calls to prevent UI hanging

## [0.1.14] - 2025-12-05
- Fix click suppression event listeners not cleaned up when extension disabled

## [0.1.13] - 2025-12-05
- Debounce settings persistence to reduce storage writes during slider drag

## [0.1.12] - 2025-12-05
- Cache checkerboard pattern tile to avoid recreating canvas on every mouse move

## [0.1.11] - 2025-12-05
- Fix overlay appearing behind page elements by setting max z-index directly on host and changing injection point

## [0.1.10] - 2025-09-15
- Reorganize assets and update build script

## [0.1.9] - 2025-09-12
- Sanitize filename prefix to avoid OS-invalid characters
- Escape dynamic HTML values in panel to prevent attribute injection
- Use passive event listeners where safe for smoother scrolling
- Add short_name, homepage_url, and i18n (default_locale, en locale)
- Add Privacy & Permissions section to README
- Add Options page with editable defaults

## [0.1.8] - 2025-09-10
- Add Rounded Corners option with live preview and export clipping

## [0.1.7] - 2025-09-10
- Add Close button next to Capture to turn off the extension quickly

## [0.1.6] - 2025-09-10
- Add Dim toggle to panel to reduce opacity (~10%) for better visibility of underlying content when padding is present

## [0.1.5] - 2025-09-10
- Make settings panel position sticky to prevent flicker on lock/unlock
- Clamp and keep panel visible on scroll/resize; add internal scroll to avoid overflow
- Reduce re-renders of panel UI; update dynamic parts without rebuilding

## [0.1.4] - 2025-09-10
- Add Capture Margin setting to include real page pixels around element

## [0.1.3] - 2025-09-10
- Update extension logo

## [0.1.2] - 2025-09-10
- Fix range slider drag by pausing hover-tracking when panel is hovered

## [0.1.1] - 2025-09-10
- Shadow DOM isolation for all UI to avoid page CSS collisions
