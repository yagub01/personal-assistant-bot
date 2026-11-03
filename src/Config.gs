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

function isDateOnly_(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

// Calendar dates are handled as day numbers in UTC, so daylight saving never shifts a date.
function dayNumber_(ymd) {
  const p = ymd.split('-').map(Number);
  return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
}

function ymdFromDayNumber_(n) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

function weekdayOf_(ymd) {
  return new Date(dayNumber_(ymd) * 86400000).getUTCDay();
}

/** Local midnight n days after the date of the given Date (23- and 25-hour days included). */
function addDays_(date, n) {
  return parseWhen_(ymdFromDayNumber_(dayNumber_(fmt_(date, 'yyyy-MM-dd')) + n));
}

/** Local midnight at the start of the following day. */
function nextMidnight_(date) {
  return addDays_(date, 1);
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

/** Returns true the first time it is called for a key within the given number of seconds, false afterwards. */
function claimOnce_(key, seconds) {
  return withLock_(function () {
    const cache = CacheService.getScriptCache();
    if (cache.get(key)) return false;
    cache.put(key, '1', seconds);
    return true;
  });
}

/** Script Property key holding the ID of a notes document, e.g. "Careers Notes" -> DOC_CAREERS_NOTES. */
function docKey_(docName) {
  return 'DOC_' + docName.replace(/\s+/g, '_').toUpperCase();
}

/** Length of a string in UTF-8 bytes. Script Properties limit each value to about 9 KB of bytes, not characters. */
function utf8Length_(s) {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4; // Surrogate pair: one 4-byte character.
      i++;
    } else bytes += 3;
  }
  return bytes;
}
