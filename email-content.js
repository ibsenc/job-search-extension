// Monitors webmail for emails from companies you've applied to.
// When you open an email, it extracts the sender's domain, analyzes the body
// for rejection/positive signals, and tells the background script to update
// any matching job's status.
//
// Supported providers: Gmail, Yahoo Mail, Outlook (live.com + office.com)
//
// Note: Webmail apps change their DOM frequently. If a provider stops working,
// open DevTools on that site, open an email, and inspect the sender/body
// elements to find updated selectors — then update PROVIDERS below.

const processedMessageIds = new Set();

// ─── Email classification patterns ───────────────────────────────────────────
// Add or remove patterns here to tune rejection/positive detection.
// Rejection requires score >= 2 before classifying; any single positive match
// overrides rejection entirely.
const EMAIL_PATTERNS = {
  rejection: [
    // "move/moving forward" negated in any form
    /\bnot (?:be )?moving forward\b/i,
    /\bnot (?:be )?move forward\b/i,
    /\bnot to move.*?forward\b/i,
    /\bwon'?t (?:be )?moving forward\b/i,
    /\bwill not (?:be )?moving forward\b/i,
    // decided / chosen not to proceed
    /\bdecided not to\b/i,
    /\bchosen (?:to )?(?:move forward with other|not)\b/i,
    /\bnot (?:be )?proceeding\b/i,
    // other / better-fit candidates
    /\bother candidates\b/i,
    /\bdifferent candidates\b/i,
    /\bmore (?:qualified|aligned|suitable|experienced) candidates\b/i,
    /\bbetter fit\b/i,
    /\bnot (?:the right |a )?fit\b/i,
    /\bdoes not meet\b/i,
    /\bdoesn'?t meet\b/i,
    // pursue / keep on file soft rejections
    /\bpursue other\b/i,
    /\bkeep your (?:resume|application|profile) on file\b/i,
    // tone markers (weak signal on their own)
    /\bunfortunately\b/i,
    /\bregrettably\b/i,
    /\bat this time\b/i,
    /\bwish you (?:the best|success|well)\b/i,
  ],
  // Offer patterns take priority — checked before interview patterns.
  // Requires score >= 2.
  offer: [
    /\boffer (?:letter|of employment)\b/i,
    /\bwe(?:'re| are) (?:excited|pleased|happy|delighted) to offer\b/i,
    /\bpleased to extend (?:an? )?offer\b/i,
    /\bcongratulations.*\boffer\b/i,
    /\bformal(?:ly)? offer\b/i,
    /\bstart(?:ing)? date\b/i,
    /\bsign(?:ing)? (?:the )?offer\b/i,
    /\bcompensation package\b/i,
    /\bbase salary of\b/i,
  ],
  // Interview patterns. Requires score >= 2.
  interview: [
    /\bmove forward with your\b/i,
    /\bwe'?d like to move forward\b/i,
    /\bpleased to (?:invite|inform)\b/i,
    /\b(?:schedule|set.?up|arrange|book)(?:d)? (?:a(?:n)? )?interview\b/i,
    /\binterview (?:request|invitation|invite)\b/i,
    /\bnext (?:step|round|stage)\b/i,
    /\bphone (?:screen|call|interview)\b/i,
    /\bcongratulations\b/i,
    /\bwe'?re (?:excited|happy|pleased) to\b/i,
    /\bwould (?:like|love) to (?:learn more|chat|connect|speak)\b/i,
  ],
};
// ─────────────────────────────────────────────────────────────────────────────

// Per-provider DOM adapters. Each entry describes how to find open email
// containers, extract a stable message ID (for dedup), the sender address,
// and the body element on that specific webmail app.
const PROVIDERS = [
  {
    name: 'gmail',
    match: () => location.hostname === 'mail.google.com',
    // Gmail wraps each expanded message in a [data-message-id] element
    getContainers: () => document.querySelectorAll('[data-message-id]'),
    getMessageId: el => el.getAttribute('data-message-id'),
    getSenderEmail: el => el.querySelector('[email]')?.getAttribute('email') ?? null,
    // .a3s is Gmail's internal class for the decoded message body
    getBodyEl: el => el.querySelector('.a3s'),
  },
  {
    name: 'yahoo',
    match: () => location.hostname === 'mail.yahoo.com',
    // Yahoo renders the open message body in a single pane identified by data-test-id
    getContainers: () => document.querySelectorAll('[data-test-id="message-view-body-container"]'),
    // Yahoo has no per-container ID; use the URL (which includes the message ID)
    getMessageId: _el => location.href,
    getSenderEmail: _el => {
      const a = document.querySelector(
        '[data-test-id="from"] a[href^="mailto:"], [data-test-id="message-from"] a[href^="mailto:"]'
      );
      return a ? a.href.slice(7) : null; // strip "mailto:"
    },
    getBodyEl: el => el,
  },
  {
    name: 'outlook',
    match: () => /outlook\.(live|office)\.com/.test(location.hostname),
    // Outlook puts the reading-pane body in a [role="document"] inside the selected message
    getContainers: () => document.querySelectorAll('[data-convid]'),
    getMessageId: el => el.getAttribute('data-convid') ?? location.href,
    getSenderEmail: _el => {
      // Sender chips carry data-hovercard-id="user@domain.com" or a title with the address
      const el = document.querySelector('[data-hovercard-id*="@"], [title*="@"][class*="from" i]');
      return el?.getAttribute('data-hovercard-id') ?? el?.title ?? null;
    },
    getBodyEl: el => el.querySelector('[role="document"]') ?? el,
  },
];

function analyzeJobEmail(text) {
  // Check offer first — it's a stronger signal than interview
  const offerMatches = EMAIL_PATTERNS.offer.filter(p => p.test(text)).map(p => p.toString());
  if (offerMatches.length >= 2) {
    return { classification: 'offer', score: offerMatches.length, matches: offerMatches };
  }

  const interviewMatches = EMAIL_PATTERNS.interview.filter(p => p.test(text)).map(p => p.toString());
  if (interviewMatches.length >= 2) {
    return { classification: 'interview', score: interviewMatches.length, matches: interviewMatches };
  }

  const rejectionMatches = EMAIL_PATTERNS.rejection.filter(p => p.test(text)).map(p => p.toString());
  if (rejectionMatches.length >= 2) {
    return { classification: 'rejection', score: rejectionMatches.length, matches: rejectionMatches };
  }

  return { classification: 'neutral', score: 0, matches: [] };
}

function checkOpenedEmails() {
  const provider = PROVIDERS.find(p => p.match());
  if (!provider) {
    console.log('[Job Tracker] No matching provider for', location.hostname);
    return;
  }

  const containers = provider.getContainers();
  if (containers.length === 0) return; // nothing open yet, skip noisy log

  console.log(`[Job Tracker] (${provider.name}) Found ${containers.length} container(s)`);

  containers.forEach(container => {
    const messageId = provider.getMessageId(container);
    if (!messageId) { console.log('[Job Tracker] Skipping: no messageId'); return; }
    if (processedMessageIds.has(messageId)) return; // already handled, skip silently

    const senderEmail = provider.getSenderEmail(container);
    if (!senderEmail) { console.log('[Job Tracker] Skipping: no sender email found'); return; }
    const domain = senderEmail.split('@')[1];
    if (!domain) { console.log('[Job Tracker] Skipping: could not parse domain from', senderEmail); return; }

    // If the body element isn't present yet (e.g. collapsed message in Gmail),
    // return WITHOUT storing the ID so it gets re-checked when expanded.
    const bodyEl = provider.getBodyEl(container);
    if (!bodyEl) { console.log(`[Job Tracker] Skipping ${senderEmail}: body element not found (collapsed?)`); return; }
    const bodyText = bodyEl.innerText || '';

    console.log(`[Job Tracker] Analyzing email from ${senderEmail} (${provider.name})`)
    const analysis = analyzeJobEmail(bodyText);
    console.log(`[Job Tracker] Result: ${analysis.classification}`, {
      score: analysis.score,
      matches: analysis.matches,
    });
    if (analysis.classification === 'neutral') return;

    processedMessageIds.add(messageId);
    const STATUS_MAP = { offer: 'Offer', interview: 'Interview', rejection: 'Rejected' };
    const status = STATUS_MAP[analysis.classification];
    console.log(`[Job Tracker] Sending status update → ${status} for domain: ${domain}`);

    try {
      chrome.runtime.sendMessage({ action: 'updateJobStatus', domain, senderEmail, status });
    } catch (e) {
      observer.disconnect();
    }
  });
}

// Gmail is a SPA — use MutationObserver to react to dynamically loaded emails
console.log('[Job Tracker] email-content.js loaded on', location.hostname);
const observer = new MutationObserver(checkOpenedEmails);
observer.observe(document.body, { childList: true, subtree: true });
