# Changelog

All notable changes to this project will be documented in this file.

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
