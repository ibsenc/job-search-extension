chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'saveJob') {
    saveJob(message.job);
    sendResponse({ success: true });

  } else if (message.action === 'getJobs') {
    chrome.storage.local.get(['jobs'], (result) => {
      sendResponse({ jobs: result.jobs || [] });
    });
    return true;

  } else if (message.action === 'editJob') {
    editJob(message.job);
    sendResponse({ success: true });

  } else if (message.action === 'deleteJob') {
    deleteJob(message.id);
    sendResponse({ success: true });

  } else if (message.action === 'updateJobStatus') {
    updateJobByDomain(message.domain, message.status, message.senderEmail);
    sendResponse({ success: true });
  }

  return true;
});

function saveJob(job) {
  chrome.storage.local.get(['jobs'], (result) => {
    const jobs = result.jobs || [];
    const existingIndex = jobs.findIndex(j => j.url === job.url);
    if (existingIndex >= 0) {
      jobs[existingIndex] = { ...jobs[existingIndex], ...job };
    } else {
      job.id = job.id || crypto.randomUUID();
      jobs.push(job);
    }
    chrome.storage.local.set({ jobs });
  });
}

function editJob(updated) {
  chrome.storage.local.get(['jobs'], (result) => {
    const jobs = result.jobs || [];
    const idx = jobs.findIndex(j => j.id === updated.id);
    if (idx >= 0) {
      jobs[idx] = { ...jobs[idx], ...updated };
      chrome.storage.local.set({ jobs });
    }
  });
}

function deleteJob(id) {
  chrome.storage.local.get(['jobs'], (result) => {
    const jobs = (result.jobs || []).filter(j => j.id !== id);
    chrome.storage.local.set({ jobs });
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
]);

// Derives the brand from sender email address.
// For ATS senders, the brand is the local-part (e.g. "zoom" from zoom@myworkday.com).
// For normal senders, the brand is the first label of the root domain (e.g. "clever" from no-reply@clever.com).
function getSenderBrand(domain, senderEmail) {
  const senderRoot = rootDomain(domain);
  const atsBrand = ATS_DOMAINS.has(senderRoot) && senderEmail
    ? senderEmail.split('@')[0].toLowerCase()
    : null;
  return { brand: atsBrand ?? senderRoot.split('.')[0].toLowerCase(), isAts: !!atsBrand };
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
    console.log(`[Job Tracker] Attempting to find a job matching sender ${senderContext.brand}."`);

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
