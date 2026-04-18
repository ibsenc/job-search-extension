# Contributing to Job Search Tracker

Contributions are welcome! Here's how to get started.

## Local Development Setup

1. Fork the repository and create a branch from `main`.
2. Clone your fork.
3. Open Chrome and go to `chrome://extensions`.
4. Enable **Developer mode** (top right).
5. Click **Load unpacked** and select the project folder.
6. The extension icon will appear in your toolbar.

There is no build step — edit the source files directly and reload the extension in Chrome (`chrome://extensions` → click the refresh icon on the extension card).

## Making Changes

- Keep changes focused — one feature or fix per PR makes review much easier.
- Test your changes manually in Chrome before opening a PR.
- Open a pull request with a clear description of what you changed and why.

## Good First Areas to Contribute

- **New job site scrapers** — add site-specific scraping support in `content.js`
- **Email classification** — improve keyword patterns in `email-content.js`
- **Email provider support** — test and fix Yahoo Mail / Outlook monitoring (currently untested)
- **UI/UX improvements** — `popup.html` and `popup.js`

## Project Structure

```
manifest.json       Extension manifest (MV3)
popup.html          Extension popup UI
popup.js            Popup logic: form, list, search/filter/sort, edit modal, CSV export
background.js       Service worker: job storage, email-triggered status updates
content.js          Content script: page scraping, apply-button detection
email-content.js    Content script: webmail monitoring and email classification
images/             Extension icons (16, 32, 48, 128px)
```
