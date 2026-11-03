/**
 * Configuration and small shared helpers.
 *
 * Secrets and IDs live in Script Properties (Project Settings > Script Properties),
 * never in this code. Required properties:
 *   TELEGRAM_TOKEN      Bot token from @BotFather
 *   ANTHROPIC_API_KEY   Claude API key
 *   GEMINI_API_KEY      Gemini API key (voice transcription)
 *   OWNER_TELEGRAM_ID   Your numeric Telegram user ID
 *   WEBAPP_URL          The web app URL from Deploy > New deployment
 *
 * Optional properties (defaults in DEFAULTS below):
 *   CLAUDE_MODEL, CLAUDE_EFFORT, GEMINI_MODEL, BRIEFING_TIME, JOURNAL_TIME, ALERT_MINUTES
 *
 * Everything else (folder, docs, sheet, topic IDs, webhook secret) is created by setup().
 */

const DEFAULTS = {
  CLAUDE_MODEL: 'claude-opus-5-5',
  CLAUDE_EFFORT: 'medium',
  GEMINI_MODEL: 'gemini-3.8-flash',
  BRIEFING_TIME: '07:30',
  JOURNAL_TIME: '23:00',
  ALERT_MINUTES: '15',
};

// Topic names. "General" is Telegram's built-in General topic; the other four are created by /setup.
const TOPICS = ['Briefing', 'Academics', 'Careers', 'Reminders', 'General'];
const CREATED_TOPICS = ['Briefing', 'Academics', 'Careers', 'Reminders'];

// Which notes document each topic reads and writes. Briefing's notes are the journal.
const TOPIC_DOCS = {
  Briefing: 'Journal',
  Academics: 'Academics Notes',
  Careers: 'Careers Notes',
  Reminders: 'General Notes',
  General: 'General Notes',
};

function prop_(key, fallback) {
  const value = PropertiesService.getScriptProperties().getProperty(key);
  if (value === null || value === '') {
    return fallback !== undefined ? fallback : DEFAULTS[key] !== undefined ? DEFAULTS[key] : null;
  }
  return value;
}

function requireProp_(key) {
  const value = prop_(key);
  if (!value) throw new Error('Missing Script Property: ' + key);
  return value;
}

function setProp_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

function tz_() {
  return Session.getScriptTimeZone();
}

/** Formats a Date as ISO 8601 with the local offset, e.g. 2026-11-05T13:00:00-05:00. */
function isoLocal_(date) {
  return Utilities.formatDate(date, tz_(), "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function fmt_(date, pattern) {
  return Utilities.formatDate(date, tz_(), pattern);
}

/**
 * Parses a date or date-time string. Strings without an offset are read in the script time zone.
 * Accepts: 2026-11-05 | 2026-11-05T13:00 | 2026-11-05T13:00:00 | 2026-11-05T13:00:00-05:00 | ...Z
 */
function parseWhen_(value) {
  const s = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return Utilities.parseDate(s, tz_(), 'yyyy-MM-dd');
  }
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(s) && s.indexOf('T') > 0) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return Utilities.parseDate(m[1] + ' ' + m[2] + ':' + m[3] + ':' + (m[4] || '00'), tz_(), 'yyyy-MM-dd HH:mm:ss');
  }
  throw new Error('Unrecognized date or time: "' + s + '". Use ISO 8601, e.g. 2026-11-05T13:00:00.');
}

function truncate_(text, max) {
  const s = String(text || '');
  return s.length > max ? s.slice(0, max) + '\n[truncated]' : s;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
