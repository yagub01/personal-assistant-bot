/**
 * Storage: shared memory (Google Sheet), topic notes and journal (Google Docs),
 * reminders and short-term chat history (Script Properties).
 */

// ---------- Shared memory (Google Sheet, "Memory" tab: ID | Created | Category | Fact) ----------

function memorySheet_() {
  return SpreadsheetApp.openById(requireProp_('MEMORY_SHEET_ID')).getSheetByName('Memory');
}

function memoryRows_() {
  const sheet = memorySheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet
    .getRange(2, 1, last - 1, 4)
    .getValues()
    .filter(function (r) {
      return r[0] && r[3];
    });
}

function memoryText_() {
  const rows = memoryRows_();
  if (!rows.length) return '(no saved memories yet)';
  return rows
    .map(function (r) {
      return '[' + r[0] + '] (' + (r[2] || 'general') + ') ' + r[3];
    })
    .join('\n');
}

/** Stops Sheets from reading text that starts with =, +, - or @ as a formula. */
function sheetText_(value) {
  const s = String(value);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function memorySave_(fact, category) {
  // The leading letter keeps Sheets from converting an all-digit ID into a number.
  const id = 'm' + Utilities.getUuid().replace(/-/g, '').slice(0, 7);
  memorySheet_().appendRow([id, fmt_(new Date(), 'yyyy-MM-dd'), sheetText_(category || 'general'), sheetText_(fact)]);
  return id;
}

function memoryDelete_(id) {
  const sheet = memorySheet_();
  const last = sheet.getLastRow();
  if (last < 2) return false;
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(id)) {
      sheet.deleteRow(i + 2);
      return true;
    }
  }
  return false;
}

// ---------- Topic notes and journal (Google Docs) ----------

function topicDocId_(topic) {
  return requireProp_(docKey_(TOPIC_DOCS[topic] || TOPIC_DOCS.General));
}

function topicDocUrl_(topic) {
  return DocumentApp.openById(topicDocId_(topic)).getUrl();
}

function readTopicNotes_(topic, maxChars) {
  const text = DocumentApp.openById(topicDocId_(topic)).getBody().getText().trim();
  if (!text) return '(empty)';
  // Keep the most recent part when the document is long.
  return text.length > maxChars ? '[earlier notes omitted]\n' + text.slice(-maxChars) : text;
}

function appendTopicNote_(topic, note) {
  const body = DocumentApp.openById(topicDocId_(topic)).getBody();
  body.appendParagraph(fmt_(new Date(), 'yyyy-MM-dd HH:mm') + ': ' + note);
}

/** Saves a journal entry exactly as given, under a dated heading. */
function appendJournalEntry_(text, isVoice) {
  const body = DocumentApp.openById(topicDocId_('Briefing')).getBody();
  const heading = fmt_(new Date(), 'EEEE, MMMM d, yyyy, HH:mm') + (isVoice ? ' (voice)' : '');
  body.appendParagraph(heading).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(text);
}

// ---------- Reminders (one Script Property per reminder: REM_<id> = {id, at, text, repeat?, time?, anchor?}) ----------

const REMINDER_PREFIX = 'REM_';

/** All pending reminders, soonest first. Pass a getProperties() snapshot to avoid another read. */
function loadReminders_(props) {
  const all = props || PropertiesService.getScriptProperties().getProperties();
  return Object.keys(all)
    .filter(function (key) {
      return key.indexOf(REMINDER_PREFIX) === 0;
    })
    .map(function (key) {
      return JSON.parse(all[key]);
    })
    .sort(function (a, b) {
      return a.at - b.at;
    });
}

function saveReminder_(item) {
  setProp_(REMINDER_PREFIX + item.id, JSON.stringify(item));
}

function deleteReminder_(id) {
  PropertiesService.getScriptProperties().deleteProperty(REMINDER_PREFIX + id);
}

/**
 * Schedules a reminder. repeat (optional) = {frequency: daily|weekly|monthly, interval, weekdays, until}.
 * A repeating reminder keeps the same local time of day and is rescheduled each time it fires.
 */
function addReminder_(text, when, repeat) {
  const item = { id: Utilities.getUuid().replace(/-/g, '').slice(0, 8), at: when.getTime(), text: truncate_(text, 1000) };
  if (repeat) {
    item.repeat = normalizeRepeat_(repeat, when);
    item.time = fmt_(when, 'HH:mm');
    item.anchor = fmt_(when, 'yyyy-MM-dd');
    // First occurrence at or after the requested time, and not in the past.
    const first = nextOccurrence_(item, Math.max(when.getTime() - 1, Date.now()));
    if (!first) throw new Error('This repeat rule has no future dates.');
    item.at = first.getTime();
  }
  saveReminder_(item);
  return item;
}

function cancelReminder_(id) {
  const key = REMINDER_PREFIX + id;
  if (prop_(key) === null) return false;
  PropertiesService.getScriptProperties().deleteProperty(key);
  return true;
}

/** After a reminder is sent (or given up on): reschedule a repeating one, delete a one-time one. */
function completeReminder_(item, now) {
  if (item.repeat) {
    const next = nextOccurrence_(item, now);
    if (next) {
      item.at = next.getTime();
      delete item.failures;
      saveReminder_(item);
      return;
    }
  }
  deleteReminder_(item.id);
}

// ---------- Repeat rules ----------

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function normalizeRepeat_(repeat, when) {
  const frequency = String(repeat.frequency || '').toLowerCase();
  if (['daily', 'weekly', 'monthly'].indexOf(frequency) === -1) {
    throw new Error('repeat.frequency must be daily, weekly, or monthly.');
  }
  const out = { frequency: frequency, interval: Math.max(1, Math.floor(Number(repeat.interval) || 1)) };
  if (frequency === 'weekly') {
    const days =
      repeat.weekdays && repeat.weekdays.length
        ? repeat.weekdays
        : [WEEKDAY_CODES[weekdayOf_(fmt_(when, 'yyyy-MM-dd'))]];
    out.weekdays = days.map(function (d) {
      const code = String(d).toUpperCase().slice(0, 2);
      if (WEEKDAY_CODES.indexOf(code) === -1) throw new Error('Unknown weekday: ' + d);
      return code;
    });
  }
  if (repeat.until) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(repeat.until)) throw new Error('repeat.until must be YYYY-MM-DD.');
    out.until = repeat.until;
  }
  return out;
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

function mondayOf_(dayNum) {
  return dayNum - ((weekdayOf_(ymdFromDayNumber_(dayNum)) + 6) % 7);
}

function matchesRepeat_(item, ymd) {
  const r = item.repeat;
  const day = dayNumber_(ymd);
  const anchor = dayNumber_(item.anchor);
  if (day < anchor) return false;
  if (r.until && ymd > r.until) return false;
  if (r.frequency === 'daily') return (day - anchor) % r.interval === 0;
  if (r.frequency === 'weekly') {
    if (r.weekdays.indexOf(WEEKDAY_CODES[weekdayOf_(ymd)]) === -1) return false;
    return ((mondayOf_(day) - mondayOf_(anchor)) / 7) % r.interval === 0;
  }
  // Monthly: same day of the month as the first reminder; months without that day are skipped.
  const a = item.anchor.split('-').map(Number);
  const c = ymd.split('-').map(Number);
  if (c[2] !== a[2]) return false;
  return ((c[0] - a[0]) * 12 + (c[1] - a[1])) % r.interval === 0;
}

/** The first occurrence strictly after afterMs, or null if the rule has ended. */
function nextOccurrence_(item, afterMs) {
  let day = Math.max(dayNumber_(fmt_(new Date(afterMs), 'yyyy-MM-dd')), dayNumber_(item.anchor));
  for (let i = 0; i < 800; i++, day++) {
    const ymd = ymdFromDayNumber_(day);
    if (item.repeat.until && ymd > item.repeat.until) return null;
    if (!matchesRepeat_(item, ymd)) continue;
    const at = parseWhen_(ymd + 'T' + item.time);
    if (at.getTime() > afterMs) return at;
  }
  return null;
}

function describeRepeat_(item) {
  if (!item.repeat) return 'once';
  const r = item.repeat;
  const unit = { daily: 'day', weekly: 'week', monthly: 'month' }[r.frequency];
  let text = r.interval > 1 ? 'every ' + r.interval + ' ' + unit + 's' : 'every ' + unit;
  if (r.frequency === 'weekly') text += ' on ' + r.weekdays.join(', ');
  text += ' at ' + item.time;
  if (r.until) text += ' until ' + r.until;
  return text;
}

// ---------- Short-term history (Script Properties, per topic, text only) ----------

const HISTORY_MAX_MESSAGES = 12;
const HISTORY_MAX_BYTES = 8000; // Script Properties allow about 9 KB (UTF-8 bytes) per value.
const HISTORY_ENTRY_MAX_CHARS = 1200;

function loadHistory_(topic) {
  return JSON.parse(prop_('HIST_' + topic, '[]'));
}

function saveHistory_(topic, history) {
  let h = history.slice(-HISTORY_MAX_MESSAGES);
  while (h.length && utf8Length_(JSON.stringify(h)) > HISTORY_MAX_BYTES) h = h.slice(2);
  // The conversation must start with a user message.
  while (h.length && h[0].role !== 'user') h = h.slice(1);
  setProp_('HIST_' + topic, JSON.stringify(h));
}

function clearHistory_(topic) {
  PropertiesService.getScriptProperties().deleteProperty('HIST_' + topic);
}
