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
    updateJobByDomain(message.domain, message.status);
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

// Called by email-content.js when a reply from a known company is detected.
// Matches saved jobs whose URL root domain equals the sender's root domain,
// or whose company name contains the sender's brand (e.g. "Google" ↔ "google.com").
function updateJobByDomain(domain, status) {
  chrome.storage.local.get(['jobs'], (result) => {
    const jobs = result.jobs || [];
    let changed = false;
    const today = new Date().toLocaleDateString('en-CA');
    const senderRoot = rootDomain(domain);
    jobs.forEach(job => {
      let matches = false;

      // Primary: compare root domains extracted from job URL and sender address
      if (job.url) {
        try {
          const jobRoot = rootDomain(new URL(job.url).hostname);
          if (jobRoot === senderRoot) matches = true;
        } catch {}
      }

      // Fallback: company name contains the sender's brand name
      // (e.g. company "Google LLC" matches sender domain "google.com")
      if (!matches && job.company) {
        const brand = senderRoot.split('.')[0].toLowerCase();
        if (job.company.toLowerCase().includes(brand)) matches = true;
      }

      if (matches) {
        // Only apply the status transition if it makes sense given the current status.
        // This prevents redundant history entries and avoids regressing a job's status.
        const current = job.status || 'Saved';
        const VALID_TRANSITIONS = {
          'Rejected':  new Set(['Applied', 'Interview']),
          'Interview': new Set(['Applied']),
          'Offer':     new Set(['Interview']),
        };
        const allowed = VALID_TRANSITIONS[status];
        if (!allowed || !allowed.has(current)) {
          console.log(`[Job Tracker] Skipping "${job.title}" — status "${status}" not valid from current "${current}"`);
          return;
        }
        console.log(`[Job Tracker] Matched job "${job.title}" at "${job.company}" → updating status to ${status}`);
        job.status = status;
        job.statusHistory = [...(job.statusHistory || []), { status, date: today, createdAt: new Date().toISOString() }];
        changed = true;
      }
    });
    if (changed) {
      chrome.storage.local.set({ jobs });
    } else {
      console.log(`[Job Tracker] No matching job found for domain "${domain}" (status: ${status}) — no records updated`);
    }
  });
}
