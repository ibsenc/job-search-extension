# Job Search Tracker

A Chrome extension (Manifest V3) that helps you track job applications, monitor/update their status, and automatically detects responses from employers in your email.

Supports both manual entry and automatic webpage scraping. All data is stored locally on your device and can be exported as a CSV.

Generated using GitHub Copilot, model Claude Sonnet 4.6.

---

## Features

### Job Form
Fill in details about a job before saving:
- **Job Title** and **Company**
- **Found On** — job board or source (LinkedIn, Indeed, Glassdoor, Handshake, ZipRecruiter, Monster, Wellfound, Dice, Company website, Referral, Recruiter, Other)
- **Location** — e.g. "Remote" or "New York, NY"
- **Salary** — free-text, e.g. "$90k–$110k"
- **Date of Posting**
- **Job Listing Link** and **Job Board Link** — direct and job-board posting URLs
- **Applied Via** — how you submitted the application
- **Date** — the date for the status entry
- **Notes** — free-form notes
- **Cover letter submitted** — checkbox

### Saving Jobs
- **Save Job** — saves with status `Saved`
- **Save & Mark Applied** — saves with status `Applied`
- **Auto-fill from page** — when you open the popup on a job listing page, the form pre-fills with the job title, company, URL, and source detected from the current tab. Location and posting date are scraped from the page DOM when available.
- **Apply-button detection** — on supported job sites, clicking the native "Apply" button automatically creates a job entry with status `Applied`, no popup interaction required.
- **Draft persistence** — form contents are saved as a draft automatically as you type. A banner shows "✏️ Draft in progress…" while editing and "✏️ Draft restored" when the draft is reloaded. You can clear the draft manually.

### Status Tracking
Each job has a **status history** — an ordered list of `{ status, date }` entries. Statuses are:

| Status | Meaning |
|---|---|
| `Saved` | Bookmarked, not yet applied |
| `Applied` | Application submitted |
| `Interview` | Interview scheduled or confirmed |
| `Offer` | Offer received |
| `Rejected` | Application declined |
| `Withdrawn` | You withdrew your application |
| `Ghosted/Listing Removed` | No response / listing taken down |

Status changes are appended to the history (never overwritten), so you can always see the full timeline of a job.

### Email Monitoring
The extension watches your webmail and automatically updates job statuses when you open emails from companies you've applied to.

**Supported email providers:**
- Gmail (`mail.google.com`)
- Yahoo Mail (`mail.yahoo.com`) (not yet tested)
- Outlook (`outlook.live.com`, `outlook.office.com`) (not yet tested)

**How it works:**
1. When you open an email, the extension extracts the sender's domain.
2. It matches the domain against your saved jobs (by URL domain or company name).
3. It analyzes the email body for keyword signals and classifies it as one of: `offer`, `interview`, `rejection`, or `neutral`.
4. If classified, it updates the matching job's status automatically. (Classification requires at least 2 matching patterns to reduce false positives.)

### Job List
All saved jobs appear in a scrollable list below the form. Click **Edit** on any card to open the edit modal.

### Editing & Deleting
The edit modal lets you update any field. If you change the status, the new status and date are appended to the status history. The modal also shows the full **status history timeline** for the job. You can **delete** an entry permanently from the modal.

### Search, Filter & Sort

**Search** — full-text search across title, company, location, notes, and status history.

**Filter by status:**
- All statuses
- Active statuses only (Saved, Applied, Interview, Offer)
- Any individual status

**Filter by source** — the "Found On" job board.

**Filter by applied via** — how you submitted.

**Sort options:**
- **Newest first** — by most recent status date (tiebroken by exact save time)
- **Oldest first** — by earliest status date
- **Status A–Z** — alphabetical by status
- **Company A–Z** — alphabetical by company name
- **Active statuses first** — Offer → Interview → Applied → Saved → Ghosted → Rejected → Withdrawn, then by most recent date within each group

### CSV Export
Click **Export All as CSV** to download all jobs as a `.csv` file with columns:
- Title, Company, Status, Latest Status Date, Found On, Location, Salary, Date Posted, Applied Via, Job Listing URL, Job Board URL, Cover Letter, Notes, Full Status History

---

## Auto-Scraping Support

When you open the popup on a job listing page, the extension attempts to scrape details. Site-specific scrapers are included for:

| Site | Scraped Fields |
|---|---|
| LinkedIn | Title, Company, Location, Date Posted |
| Indeed | Title, Company, Location |
| Glassdoor | Title, Company, Location |
| ZipRecruiter | Title, Company, Location |
| Monster | Title, Company, Location |
| Wellfound | Title, Company, Location |
| Dice | Title, Company, Location, Date Posted |

On other sites, a generic scraper tries common `h1`/`h2` and heading selectors. The page tab title and hostname are always used as fallbacks.

---

## Installation

1. Clone or download this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the project folder.
5. The extension icon will appear in your toolbar.

---

## Permissions

| Permission | Why |
|---|---|
| `storage` | Saves and reads your job list and draft |
| `activeTab` | Reads the current tab's URL and title for auto-fill |
| `scripting` | Sends messages to the content script for page scraping |
| `tabs` | Accesses tab metadata for prefill |
| `<all_urls>` | Runs the content script on job listing pages for scraping and apply-button detection |
| `https://mail.google.com/*` etc. | Runs the email monitor on webmail providers |

---

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

---

## Data Storage

All data is stored locally in `chrome.storage.local` under the key `jobs` — an array of job objects. Nothing is sent to any server. A `formDraft` key stores the current in-progress form state.

Each job object looks like:

```json
{
  "id": "uuid",
  "title": "Software Engineer",
  "company": "Acme Corp",
  "foundOn": "LinkedIn",
  "location": "Remote",
  "salary": "$120k–$140k",
  "datePosted": "2026-04-01",
  "url": "https://acme.com/jobs/123",
  "jobBoardLink": "https://linkedin.com/jobs/view/...",
  "appliedVia": "Job board",
  "status": "Interview",
  "statusHistory": [
    { "status": "Saved",     "date": "2026-04-01", "createdAt": "2026-04-01T10:00:00.000Z" },
    { "status": "Applied",   "date": "2026-04-02", "createdAt": "2026-04-02T09:15:00.000Z" },
    { "status": "Interview", "date": "2026-04-08", "createdAt": "2026-04-08T14:22:00.000Z" }
  ],
  "notes": "Referred by Jane Doe",
  "coverLetter": true
}
```

## References
https://developer.chrome.com/docs/extensions/get-started