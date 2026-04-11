const saveBtn        = document.getElementById('save-btn');
const saveAppliedBtn = document.getElementById('save-applied-btn');
const statusMsg  = document.getElementById('status-msg');
const jobsList   = document.getElementById('jobs-list');
const editModal  = document.getElementById('edit-modal');
const modalClose = document.getElementById('modal-close');
const modalOverlay  = document.getElementById('modal-overlay');
const modalSaveBtn  = document.getElementById('modal-save-btn');
const modalDeleteBtn = document.getElementById('modal-delete-btn');

const searchInput      = document.getElementById('search-input');
const sortSelect       = document.getElementById('sort-select');
const filterStatus     = document.getElementById('filter-status');
const filterSite       = document.getElementById('filter-site');
const filterAppliedVia = document.getElementById('filter-applied-via');
const resultsCount     = document.getElementById('results-count');
const clearFiltersBtn  = document.getElementById('clear-filters');

const fields = {
  title:       document.getElementById('f-title'),
  company:     document.getElementById('f-company'),
  foundOn:     document.getElementById('f-found-on'),
  location:    document.getElementById('f-location'),
  salary:      document.getElementById('f-salary'),
  datePosted:  document.getElementById('f-date-posted'),
  link:        document.getElementById('f-link'),
  jobBoardLink: document.getElementById('f-job-board-link'),
  appliedVia:  document.getElementById('f-applied-via'),
  statusDate:  document.getElementById('f-status-date'),
  notes:       document.getElementById('f-notes'),
  coverLetter: document.getElementById('f-cover-letter'),
};

const mFields = {
  title:       document.getElementById('m-title'),
  company:     document.getElementById('m-company'),
  foundOn:     document.getElementById('m-found-on'),
  location:    document.getElementById('m-location'),
  salary:      document.getElementById('m-salary'),
  datePosted:  document.getElementById('m-date-posted'),
  link:        document.getElementById('m-link'),
  jobBoardLink: document.getElementById('m-job-board-link'),
  appliedVia:  document.getElementById('m-applied-via'),
  status:      document.getElementById('m-status'),
  statusDate:  document.getElementById('m-status-date'),
  notes:       document.getElementById('m-notes'),
  coverLetter: document.getElementById('m-cover-letter'),
};

let editingJobId = null;
let allJobs = [];

function todayLocal() {
  return new Date().toLocaleDateString('en-CA');
}

// Returns the most recent { status, date } entry for a job.
function latestStatus(job) {
  if (!job.statusHistory || job.statusHistory.length === 0) {
    return { status: job.status || 'Saved', date: '' };
  }
  return job.statusHistory[job.statusHistory.length - 1];
}

// Detect job site from a full URL string (used to pre-fill the popup form).
function detectJobSiteFromUrl(urlStr) {
  let url;
  try { url = new URL(urlStr); } catch { return ''; }

  const params = url.searchParams;
  for (const name of ['jobSite', 'job_site', 'src', 'source', 'utm_source', 'ref', 'via']) {
    const val = params.get(name);
    if (val) return val;
  }
  const host = url.hostname;
  if (host.includes('linkedin.com'))      return 'LinkedIn';
  if (host.includes('indeed.com'))        return 'Indeed';
  if (host.includes('glassdoor.com'))     return 'Glassdoor';
  if (host.includes('ziprecruiter.com'))  return 'ZipRecruiter';
  if (host.includes('monster.com'))       return 'Monster';
  if (host.includes('wellfound.com'))     return 'Wellfound';
  if (host.includes('joinhandshake.com')) return 'Handshake';
  if (host.includes('dice.com'))          return 'Dice';
  return '';
}

const draftBanner     = document.getElementById('draft-banner');
const draftBannerText = document.getElementById('draft-banner-text');
const clearDraftBtn   = document.getElementById('clear-draft-btn');

const DRAFT_KEY = 'formDraft';

function readDraft(callback) {
  chrome.storage.local.get([DRAFT_KEY], r => callback(r[DRAFT_KEY] || null));
}

function saveDraft() {
  draftBannerText.textContent = '✏️ Draft in progress…';
  draftBanner.style.display = 'flex';
  const draft = {
    title:        fields.title.value,
    company:      fields.company.value,
    foundOn:      fields.foundOn.value,
    location:     fields.location.value,
    salary:       fields.salary.value,
    datePosted:   fields.datePosted.value,
    link:         fields.link.value,
    jobBoardLink: fields.jobBoardLink.value,
    appliedVia:   fields.appliedVia.value,
    statusDate:   fields.statusDate.value,
    notes:        fields.notes.value,
    coverLetter:  fields.coverLetter.checked,
  };
  chrome.storage.local.set({ [DRAFT_KEY]: draft });
}

function clearDraft() {
  chrome.storage.local.remove(DRAFT_KEY);
}

function restoreDraft(draft) {
  fields.title.value        = draft.title        ?? '';
  fields.company.value      = draft.company      ?? '';
  fields.foundOn.value      = draft.foundOn      ?? '';
  fields.location.value     = draft.location     ?? '';
  fields.salary.value       = draft.salary       ?? '';
  fields.datePosted.value   = draft.datePosted   ?? '';
  fields.link.value         = draft.link         ?? '';
  fields.jobBoardLink.value = draft.jobBoardLink ?? '';
  fields.appliedVia.value   = draft.appliedVia   ?? '';
  fields.statusDate.value   = draft.statusDate   || todayLocal();
  fields.notes.value        = draft.notes        ?? '';
  fields.coverLetter.checked = !!draft.coverLetter;
  draftBannerText.textContent = '✏️ Draft restored';
  draftBanner.style.display = 'flex';
}

function prefillFromTab(tab) {
  let hostname = '';
  try { hostname = new URL(tab.url).hostname.replace(/^www\./, ''); } catch {}
  // Populate basics immediately from what the browser already knows
  fields.title.value      = tab.title || '';
  fields.company.value    = hostname;
  fields.link.value       = tab.url || '';
  fields.statusDate.value = todayLocal();
  fields.foundOn.value    = detectJobSiteFromUrl(tab.url || '');

  // Ask the content script (which lives in the isolated world and has DOM access)
  // to run scrapeJobData() and send the result back.
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { action: 'scrapeJobData' }, (data) => {
    if (chrome.runtime.lastError || !data) return;
    if (data.location)   fields.location.value   = data.location;
    if (data.datePosted) fields.datePosted.value = data.datePosted;
  });
}

// Save draft on any field change
Object.values(fields).forEach(el => {
  el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', saveDraft);
  if (el.tagName === 'SELECT') el.addEventListener('change', saveDraft);
});

// On clear draft: wipe storage and re-run tab pre-fill
clearDraftBtn.addEventListener('click', () => {
  clearDraft();
  draftBanner.style.display = 'none';
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (tab) prefillFromTab(tab);
  });
});

// --- Pre-fill form from the active tab (or restore draft) ---
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs && tabs[0];
  readDraft(draft => {
    if (draft) {
      restoreDraft(draft);
    } else if (tab) {
      prefillFromTab(tab);
    }
  });
});

function buildJob(status) {
  const statusDate = fields.statusDate.value || todayLocal();
  return {
    title:         fields.title.value.trim()   || 'Untitled',
    company:       fields.company.value.trim() || 'Unknown',
    foundOn:       fields.foundOn.value,
    location:      fields.location.value.trim(),
    salary:        fields.salary.value.trim(),
    datePosted:    fields.datePosted.value,
    url:           fields.link.value.trim(),
    jobBoardLink:  fields.jobBoardLink.value.trim(),
    appliedVia:    fields.appliedVia.value,
    statusHistory: [{ status, date: statusDate, createdAt: new Date().toISOString() }],
    status,
    notes:         fields.notes.value.trim(),
    coverLetter:   fields.coverLetter.checked,
  };
}

// --- Manual save ---
saveBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'saveJob', job: buildJob('Saved') }, () => {
    clearDraft();
    draftBanner.style.display = 'none';
    statusMsg.textContent = 'Job saved!';
    setTimeout(() => { statusMsg.textContent = ''; }, 2000);
    loadJobs();
  });
});

saveAppliedBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'saveJob', job: buildJob('Applied') }, () => {
    clearDraft();
    draftBanner.style.display = 'none';
    statusMsg.textContent = 'Job saved as Applied!';
    setTimeout(() => { statusMsg.textContent = ''; }, 2000);
    loadJobs();
  });
});

// --- Edit modal ---
function openEditModal(job) {
  editingJobId               = job.id;
  mFields.title.value        = job.title       || '';
  mFields.company.value      = job.company     || '';
  mFields.foundOn.value      = job.foundOn     || '';
  mFields.location.value     = job.location    || '';
  mFields.salary.value       = job.salary      || '';
  mFields.datePosted.value   = job.datePosted  || '';
  mFields.link.value         = job.url         || '';
  mFields.jobBoardLink.value = job.jobBoardLink || '';
  mFields.appliedVia.value   = job.appliedVia  || '';
  mFields.status.value       = job.status      || 'Saved';
  mFields.statusDate.value   = latestStatus(job).date || todayLocal();
  mFields.notes.value        = job.notes       || '';
  mFields.coverLetter.checked = !!job.coverLetter;

  // Render status history
  const historyEl = document.getElementById('m-status-history');
  const history   = job.statusHistory;
  if (history.length > 0) {
    historyEl.innerHTML = '<div class="history-label">Status history</div>' +
      history.map(h => `<div class="history-row"><span class="history-date">${esc(h.date)}</span><span class="history-status">${esc(h.status)}</span></div>`).join('');
  } else {
    historyEl.innerHTML = '';
  }

  editModal.style.display = 'flex';
}

function closeEditModal() {
  editModal.style.display = 'none';
  editingJobId = null;
}

modalClose.addEventListener('click', closeEditModal);
modalOverlay.addEventListener('click', closeEditModal);

modalSaveBtn.addEventListener('click', () => {
  if (!editingJobId) return;
  const originalJob     = allJobs.find(j => j.id === editingJobId);
  const newStatus       = mFields.status.value;
  const newStatusDate   = mFields.statusDate.value || todayLocal();
  const existingHistory = originalJob.statusHistory;
  const statusChanged   = latestStatus(originalJob).status !== newStatus;
  const newHistory      = statusChanged
    ? [...existingHistory, { status: newStatus, date: newStatusDate, createdAt: new Date().toISOString() }]
    : existingHistory;
  const updated = {
    id:            editingJobId,
    title:         mFields.title.value.trim()   || 'Untitled',
    company:       mFields.company.value.trim() || 'Unknown',
    foundOn:       mFields.foundOn.value,
    location:      mFields.location.value.trim(),
    salary:        mFields.salary.value.trim(),
    datePosted:    mFields.datePosted.value,
    url:           mFields.link.value.trim(),
    jobBoardLink:  mFields.jobBoardLink.value.trim(),
    appliedVia:    mFields.appliedVia.value,
    status:        newStatus,
    statusHistory: newHistory,
    notes:         mFields.notes.value.trim(),
    coverLetter:   mFields.coverLetter.checked,
  };
  chrome.runtime.sendMessage({ action: 'editJob', job: updated }, () => {
    closeEditModal();
    loadJobs();
  });
});

modalDeleteBtn.addEventListener('click', () => {
  if (!editingJobId) return;
  chrome.runtime.sendMessage({ action: 'deleteJob', id: editingJobId }, () => {
    closeEditModal();
    loadJobs();
  });
});

document.getElementById('export-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'getJobs' }, ({ jobs }) => {
    if (!jobs || jobs.length === 0) {
      alert('No saved jobs to export.');
      return;
    }
    const headers = ['Title', 'Company', 'Found On', 'Location', 'Salary', 'Date Posted', 'Job Listing Link', 'Job Board Link', 'Applied Via', 'Status', 'Status Date', 'Cover Letter', 'Notes', 'Status History'];
    const rows = jobs.map(j => {
      const latest = latestStatus(j);
      return [
        j.title        || '',
        j.company      || '',
        j.foundOn      || '',
        j.location     || '',
        j.salary       || '',
        j.datePosted   || '',
        j.url          || '',
        j.jobBoardLink || '',
        j.appliedVia   || '',
        latest.status || '',
        latest.date   || '',
        j.coverLetter ? 'Yes' : 'No',
        j.notes       || '',
        (j.statusHistory || []).map(h => `${h.date}: ${h.status}`).join(' | '),
      ];
    });

    const csv = [headers, ...rows]
      .map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });
});

// --- Display saved jobs ---
function loadJobs() {
  chrome.runtime.sendMessage({ action: 'getJobs' }, ({ jobs }) => {
    allJobs = jobs || [];
    renderJobs();
  });
}

function renderJobs() {
  const query  = searchInput.value.trim().toLowerCase();
  const sort   = sortSelect.value;
  const status = filterStatus.value;
  const site   = filterSite.value;
  const via    = filterAppliedVia.value;

  const anyFilter = query || status || site || via;
  clearFiltersBtn.classList.toggle('hidden', !anyFilter);

  let list = allJobs.slice();

  // Search across key text fields
  if (query) {
    list = list.filter(j =>
      [j.title, j.company, j.location, j.salary, j.notes, j.foundOn]
        .some(f => f && f.toLowerCase().includes(query))
    );
  }
  // Filters
  const ACTIVE_STATUSES = new Set(['Saved', 'Applied', 'Interview', 'Offer']);
  if (status === '__active') list = list.filter(j => ACTIVE_STATUSES.has(j.status));
  else if (status)           list = list.filter(j => j.status === status);
  if (site)   list = list.filter(j => j.foundOn === site);
  if (via)    list = list.filter(j => j.appliedVia === via);

  // Sort
  if (sort === 'newest') {
    list.sort((a, b) => {
      const la = latestStatus(a), lb = latestStatus(b);
      return (lb.date || '').localeCompare(la.date || '') || (lb.createdAt || '').localeCompare(la.createdAt || '');
    });
  } else if (sort === 'oldest') {
    list.sort((a, b) => {
      const la = latestStatus(a), lb = latestStatus(b);
      return (la.date || '').localeCompare(lb.date || '') || (la.createdAt || '').localeCompare(lb.createdAt || '');
    });
  } else if (sort === 'status') {
    list.sort((a, b) => (a.status || '').localeCompare(b.status || ''));
  } else if (sort === 'company') {
    list.sort((a, b) => (a.company || '').localeCompare(b.company || ''));
  } else if (sort === 'active') {
    const STATUS_ORDER = { 'Offer': 0, 'Interview': 1, 'Applied': 2, 'Saved': 3, 'Ghosted': 4, 'Rejected': 5, 'Withdrawn': 6 };
    list.sort((a, b) => {
      const aOrder = STATUS_ORDER[a.status] ?? 99;
      const bOrder = STATUS_ORDER[b.status] ?? 99;
      if (aOrder !== bOrder) return aOrder - bOrder;
      const la = latestStatus(a), lb = latestStatus(b);
      return (lb.date || '').localeCompare(la.date || '') || (lb.createdAt || '').localeCompare(la.createdAt || '');
    });
  }

  // Results count
  resultsCount.textContent = allJobs.length > 0
    ? `${list.length} of ${allJobs.length} job${allJobs.length !== 1 ? 's' : ''}`
    : '';

  jobsList.innerHTML = '';

  if (allJobs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No jobs saved yet.';
    jobsList.appendChild(empty);
    return;
  }

  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No jobs match your filters.';
    jobsList.appendChild(empty);
    return;
  }

  list.forEach(job => {
    const card = document.createElement('div');
    card.className = 'job-card';

    card.innerHTML = `
      <div class="job-title">${esc(job.title)}</div>
      <div class="job-company">${esc(job.company)}${job.location ? ' &mdash; ' + esc(job.location) : ''}</div>
      <div class="job-detail">
        ${job.foundOn     ? `<span>&#128269; ${esc(job.foundOn)}</span>` : ''}
        ${job.salary      ? `<span>&#128181; ${esc(job.salary)}</span>` : ''}
        ${job.datePosted  ? `<span>Posted: ${esc(job.datePosted)}</span>` : ''}
        ${job.appliedVia  ? `<span>Applied via: ${esc(job.appliedVia)}</span>` : ''}
        ${job.coverLetter ? `<span>&#10003; Cover letter</span>` : ''}
      </div>
      ${job.notes ? `<div class="job-notes">${esc(job.notes)}</div>` : ''}
      <div class="job-meta">
        ${(() => { const l = latestStatus(job); return `<span><span class="meta-label">Status:</span> <span class="job-status ${statusClass(l.status)}">${esc(l.status)}</span></span>${l.date ? ` <span class="meta-label">${localDate(l.date)}</span>` : ''}`; })()}
        <a href="${safeUrl(job.url)}" target="_blank" rel="noopener noreferrer" style="color:#1a73e8;">Go to Job Post</a>
      </div>
    `;

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'card-edit-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openEditModal(job));
    actions.appendChild(editBtn);
    card.appendChild(actions);

    jobsList.appendChild(card);
  });
}

// Parse a YYYY-MM-DD string as local time (not UTC) to avoid off-by-one day in local timezones.
function localDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString();
}

function statusClass(status) {
  switch (status) {
    case 'Saved':                  return 'status-saved';
    case 'Applied':                return 'status-applied';
    case 'Interview':              return 'status-interview';
    case 'Offer':                  return 'status-offer';
    case 'Rejected':               return 'status-rejected';
    case 'Withdrawn':              return 'status-withdrawn';
    case 'Ghosted/Listing Removed': return 'status-ghosted';
    default:                       return 'status-other';
  }
}

// Prevent XSS when inserting user-controlled text via innerHTML
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? url : '#';
  } catch {
    return '#';
  }
}

// --- Search / Sort / Filter ---
[searchInput, sortSelect, filterStatus, filterSite, filterAppliedVia].forEach(el => {
  el.addEventListener('input', renderJobs);
});

clearFiltersBtn.addEventListener('click', () => {
  searchInput.value      = '';
  sortSelect.value       = 'newest';
  filterStatus.value     = '';
  filterSite.value       = '';
  filterAppliedVia.value = '';
  renderJobs();
});

loadJobs();
