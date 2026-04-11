// Returns trimmed text of the first selector that matches a non-empty element.
function qs(...selectors) {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.textContent || el.getAttribute('datetime') || '').trim();
        if (text) return text;
      }
    } catch {}
  }
  return null;
}

// Site-specific scrapers keyed by hostname substring.
// Selectors target both current and legacy DOM layouts for resilience.
const SITE_SCRAPERS = {
  'linkedin.com': () => ({
    title:      qs('.job-details-jobs-unified-top-card__job-title h1',
                   '.topcard__title'),
    company:    qs('.job-details-jobs-unified-top-card__company-name a',
                   '.topcard__org-name-link'),
    location:   qs('.job-details-jobs-unified-top-card__primary-description-without-tagline .tvm__text',
                   '.topcard__flavor--bullet'),
    datePosted: qs('.job-details-jobs-unified-top-card__posted-date',
                   '.posted-time-ago__text'),
  }),
  'indeed.com': () => ({
    title:      qs('[data-testid="jobsearch-JobInfoHeader-title"] span',
                   'h1.jobsearch-JobInfoHeader-title'),
    company:    qs('[data-testid="inlineHeader-companyName"] a',
                   '[data-testid="inlineHeader-companyName"]'),
    location:   qs('[data-testid="job-location"]',
                   '[data-testid="jobsearch-JobInfoHeader-subtitle"] div:last-child'),
    datePosted: null,
  }),
  'glassdoor.com': () => ({
    title:      qs('[data-test="job-title"]',
                   'h1[data-test="job-title"]'),
    company:    qs('[data-test="employer-name"]'),
    location:   qs('[data-test="location"]'),
    datePosted: null,
  }),
  'ziprecruiter.com': () => ({
    title:      qs('h1.job_title',
                   '[data-testid="job-title"]'),
    company:    qs('a.hiring_company_text',
                   '[data-testid="job-company"]'),
    location:   qs('.job_location',
                   '[data-testid="job-location"]'),
    datePosted: null,
  }),
  'monster.com': () => ({
    title:      qs('h1.title',
                   '[data-testid="jobTitle"]'),
    company:    qs('[data-testid="company"]',
                   '.name a'),
    location:   qs('[data-testid="job-location"]',
                   '.location'),
    datePosted: null,
  }),
  'wellfound.com': () => ({
    title:      qs('h1[class*="title"]',
                   '[class*="JobListing"] h1'),
    company:    qs('[class*="startupName"]',
                   '[data-test="startup-name"]'),
    location:   qs('[class*="locations"]',
                   '[data-test="locations"]'),
    datePosted: null,
  }),
  'dice.com': () => ({
    title:      qs('h1.jobTitle',
                   '[data-cy="jobTitle"]'),
    company:    qs('[data-cy="companyNameLink"]',
                   '.companyInfo a'),
    location:   qs('[data-cy="location"]',
                   '.location'),
    datePosted: qs('[data-cy="postedDate"]'),
  }),
};

// Generic fallback: matches common class/id/microdata naming patterns.
function genericScrape() {
  return {
    title: qs(
      '[class*="job_title"],[class*="job-title"],[id*="job_title"],[id*="job-title"]',
      '[class*="jobtitle"],[id*="jobtitle"]',
      '[class*="job__title"],[id*="job__title"]',
      '[class*="position_title"],[class*="position-title"]',
      '[itemprop="title"]',
      'h1',
      'h2'
    ),
    company: qs(
      '[class*="company_name"],[class*="company-name"],[id*="company_name"]',
      '[class*="employer_name"],[class*="employer-name"]',
      '[itemprop="hiringOrganization"] [itemprop="name"]',
      '[class*="companyName"]'
    ),
    location: qs(
      '[class*="job_location"],[class*="job-location"],[id*="job_location"]',
      '[class*="position-location"]',
      '[itemprop="jobLocation"] [itemprop="addressLocality"]',
      '[class*="location"]'
    ),
    datePosted: qs(
      '[class*="date_posted"],[class*="date-posted"],[id*="date_posted"]',
      '[class*="posted_date"],[class*="posted-date"]',
      '[itemprop="datePosted"]',
      'time[datetime]'
    ),
  };
}

function scrapeJobData() {
  const host = window.location.hostname;

  for (const [domain, scraper] of Object.entries(SITE_SCRAPERS)) {
    if (host.includes(domain)) {
      const data = scraper();
      const generic = genericScrape();
      return {
        title:      data.title      || generic.title      || '',
        company:    data.company    || generic.company     || host.replace(/^www\./, ''),
        location:   data.location   || generic.location   || '',
        datePosted: data.datePosted || generic.datePosted || '',
      };
    }
  }

  // Unknown site: generic scrape then final fallback
  const generic = genericScrape();
  return {
    title:      generic.title      || '',
    company:    generic.company    || host.replace(/^www\./, ''),
    location:   generic.location   || '',
    datePosted: generic.datePosted || '',
  };
}

// Tries URL query params first (e.g. ?src=LinkedIn, ?utm_source=Indeed),
// then falls back to recognizing the hostname directly.
function detectJobSite() {
  const params = new URLSearchParams(window.location.search);
  for (const name of ['jobSite', 'job_site', 'src', 'source', 'utm_source', 'ref', 'via']) {
    const val = params.get(name);
    if (val) return val;
  }
  const host = window.location.hostname;
  if (host.includes('linkedin.com'))     return 'LinkedIn';
  if (host.includes('indeed.com'))       return 'Indeed';
  if (host.includes('glassdoor.com'))    return 'Glassdoor';
  if (host.includes('ziprecruiter.com')) return 'ZipRecruiter';
  if (host.includes('monster.com'))      return 'Monster';
  if (host.includes('wellfound.com'))    return 'Wellfound';
  if (host.includes('joinhandshake.com')) return 'Handshake';
  if (host.includes('dice.com'))         return 'Dice';
  return '';
}

// Responds to popup requests to scrape the current page.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'scrapeJobData') {
    sendResponse(scrapeJobData());
  }
  return false;
});

// Listens for clicks on any "Apply" button/link across all websites.
// Uses capture phase so we record the click before any SPA routing occurs.
document.addEventListener('click', (e) => {
  const target = e.target.closest('button, a, [role="button"], input[type="submit"]');
  if (!target) return;

  const text = (target.textContent || target.value || '').trim().toLowerCase();
  if (!text.includes('apply')) return;

  // Scrape at click time so all dynamically-rendered content is present.
  const scraped = scrapeJobData();
  const today = new Date().toLocaleDateString('en-CA');
  const job = {
    title:         scraped.title,
    url:           window.location.href,
    company:       scraped.company,
    foundOn:       detectJobSite(),
    location:      scraped.location,
    datePosted:    scraped.datePosted,
    appliedVia:    'Job board',
    notes:         '',
    coverLetter:   false,
    status:        'Applied',
    statusHistory: [{ status: 'Applied', date: today, createdAt: new Date().toISOString() }],
  };

  // Write directly to storage instead of messaging the background service worker.
  // sendMessage is unreliable when the apply button navigates away from the page,
  // because the service worker may go idle before completing the async storage write.
  chrome.storage.local.get(['jobs'], (result) => {
    const jobs = result.jobs || [];
    const existingIndex = jobs.findIndex(j => j.url === job.url);
    if (existingIndex >= 0) {
      jobs[existingIndex] = { ...jobs[existingIndex], ...job };
    } else {
      job.id = crypto.randomUUID();
      jobs.push(job);
    }
    chrome.storage.local.set({ jobs });
  });
}, true /* capture phase */);

