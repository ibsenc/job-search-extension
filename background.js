chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'saveJob') {
    saveJob(message.job, () => sendResponse({ success: true }));

  } else if (message.action === 'getJobs') {
    chrome.storage.local.get(['jobs'], (result) => {
      sendResponse({ jobs: result.jobs || [] });
    });
    return true;

  } else if (message.action === 'editJob') {
    editJob(message.job, () => sendResponse({ success: true }));

  } else if (message.action === 'deleteJob') {
    deleteJob(message.id, () => sendResponse({ success: true }));

  } else if (message.action === 'updateJobStatus') {
    updateJobByDomain(message.domain, message.status, message.senderEmail);
    sendResponse({ success: true });
  }

  return true;
});

function saveJob(job, callback) {
  chrome.storage.local.get(['jobs'], (result) => {
    const jobs = result.jobs || [];
    const existingIndex = jobs.findIndex(j => j.url === job.url);
    if (existingIndex >= 0) {
      jobs[existingIndex] = { ...jobs[existingIndex], ...job };
    } else {
      job.id = job.id || crypto.randomUUID();
      jobs.push(job);
    }
    chrome.storage.local.set({ jobs }, callback);
  });
}

function editJob(updated, callback) {
  chrome.storage.local.get(['jobs'], (result) => {
    const jobs = result.jobs || [];
    const idx = jobs.findIndex(j => j.id === updated.id);
    if (idx >= 0) {
      jobs[idx] = { ...jobs[idx], ...updated };
      chrome.storage.local.set({ jobs }, callback);
    } else if (callback) {
      callback();
    }
  });
}

function deleteJob(id, callback) {
  chrome.storage.local.get(['jobs'], (result) => {
    const jobs = (result.jobs || []).filter(j => j.id !== id);
    chrome.storage.local.set({ jobs }, callback);
  });
}

// Returns the registrable domain (last two labels), e.g. "jobs.linkedin.com" → "linkedin.com"
function rootDomain(hostname) {
  const parts = hostname.replace(/^www\./, '').split('.');
  return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
}

// Known ATS/recruiting platforms where the email sender domain doesn't include company name.
const ATS_DOMAINS = new Set([
  'myworkday.com', 'workdayjobs.com', 'greenhouse.io', 'lever.co',
  'jobvite.com', 'icims.com', 'smartrecruiters.com', 'taleo.net',
  'ashbyhq.com',
]);

// Generic email local-parts that don't identify a specific company.
// When an ATS email comes from one of these (e.g. jobs@ashbyhq.com), the
// local-part would match unrelated job URLs (e.g. "jobs" matches every
// jobs.ashbyhq.com URL), so we treat the company as unidentifiable.
const GENERIC_SENDER_LOCALS = new Set([
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'notifications', 'mail', 'info', 'hello', 'team',
  'recruiting', 'hr', 'support', 'careers', 'talent',
  'jobs', 'apply', 'applications',
]);

// Derives the brand from sender email address.
// For ATS senders, the brand is the local-part (e.g. "zoom" from zoom@myworkday.com),
// unless that local-part is too generic to identify a company (returns null brand).
// For normal senders, the brand is the first label of the root domain (e.g. "clever" from no-reply@clever.com).
function getSenderBrand(domain, senderEmail) {
  const senderRoot = rootDomain(domain);
  if (!ATS_DOMAINS.has(senderRoot)) {
    return { brand: senderRoot.split('.')[0].toLowerCase(), isAts: false };
  }
  const local = senderEmail ? senderEmail.split('@')[0].toLowerCase() : null;
  if (!local || GENERIC_SENDER_LOCALS.has(local)) {
    return { brand: null, isAts: true };
  }
  return { brand: local, isAts: true };
}

// Determines whether a saved job matches the sender of an email.
// Returns a string describing how it matched, or null if no match.
//
// Two checks are run against the brand to find a matching saved job:
//   1. Company name: job.company.toLowerCase().includes(brand)
//   2. URL:
//      - ATS:    job.url contains brand anywhere (e.g. "zoom.wd5.myworkdayjobs.com", "job-boards.greenhouse.io/seesaw/jobs/...")
//      - Normal: job.url root domain === senderRoot (e.g. "clever.com" === "clever.com")
function jobMatchesSender(job, domain, { brand, isAts }) {
  // Check company name
  if (job.company?.toLowerCase().includes(brand)) {
    return 'company-name';
  }

  // Check URL
  if (job.url) {
    try {
      if (isAts) {
        if (job.url.toLowerCase().includes(brand)) return 'ats-url';
      } else {
        if (rootDomain(new URL(job.url).hostname) === rootDomain(domain)) return 'primary-domain';
      }
    } catch {}
  }

  return null;
}

// Called by email-content.js when a reply from a known company is detected.
// Iterates all saved jobs, delegates matching to jobMatchesSender, and applies
// the status transition if valid.
function updateJobByDomain(domain, status, senderEmail) {
  chrome.storage.local.get(['jobs'], (result) => {
    const jobs = result.jobs || [];
    let changed = false;
    const today = new Date().toLocaleDateString('en-CA');
    const senderContext = getSenderBrand(domain, senderEmail);
    if (!senderContext.brand) {
      console.log(`[Job Tracker] Skipping — "${senderEmail}" is a generic ATS address with no identifiable company brand`);
      return;
    }
    console.log(`[Job Tracker] Attempting to find a job matching sender "${senderContext.brand}".`);

    jobs.forEach(job => {
      const matchStrategy = jobMatchesSender(job, domain, senderContext);
      if (!matchStrategy) return;

      const current = job.status || 'Saved';
      console.log(`[Job Tracker] Matched "${job.title}" at "${job.company}" via ${matchStrategy} — current status: "${current}", requested status: "${status}"`);

      const VALID_TRANSITIONS = {
        'Rejected':  new Set(['Applied', 'Interview']),
        'Interview': new Set(['Applied']),
        'Offer':     new Set(['Interview']),
      };
      const allowed = VALID_TRANSITIONS[status];
      if (!allowed || !allowed.has(current)) {
        console.log(`[Job Tracker] Skipping — "${status}" not a valid transition from "${current}"`);
        return;
      }
      job.status = status;
      job.statusHistory = [...(job.statusHistory || []), { status, date: today, createdAt: new Date().toISOString() }];
      changed = true;
    });
    if (changed) {
      chrome.storage.local.set({ jobs });
    } else {
      console.log(`[Job Tracker] No matching job found for domain "${domain}" (status: ${status}) — no records updated`);
    }
  });
}
