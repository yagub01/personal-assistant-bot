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

function memorySave_(fact, category) {
  const id = Utilities.getUuid().slice(0, 8);
  memorySheet_().appendRow([id, fmt_(new Date(), 'yyyy-MM-dd'), category || 'general', fact]);
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
  const docName = TOPIC_DOCS[topic] || TOPIC_DOCS.General;
  return requireProp_('DOC_' + docName.replace(/\s+/g, '_').toUpperCase());
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

// ---------- Reminders (Script Properties, JSON list of {id, at, text}) ----------

function loadReminders_() {
  return JSON.parse(prop_('REMINDERS', '[]'));
}

function saveReminders_(list) {
  setProp_('REMINDERS', JSON.stringify(list));
}

function addReminder_(text, when) {
  return withLock_(function () {
    const list = loadReminders_();
    const item = { id: Utilities.getUuid().slice(0, 8), at: when.getTime(), text: text };
    list.push(item);
    list.sort(function (a, b) {
      return a.at - b.at;
    });
    saveReminders_(list);
    return item;
  });
}

function cancelReminder_(id) {
  return withLock_(function () {
    const list = loadReminders_();
    const kept = list.filter(function (r) {
      return r.id !== id;
    });
    saveReminders_(kept);
    return kept.length !== list.length;
  });
}

/** Removes and returns every reminder that is due. */
function takeDueReminders_() {
  return withLock_(function () {
    const now = Date.now();
    const list = loadReminders_();
    const due = list.filter(function (r) {
      return r.at <= now;
    });
    if (due.length) {
      saveReminders_(
        list.filter(function (r) {
          return r.at > now;
        })
      );
    }
    return due;
  });
}

// ---------- Short-term history (Script Properties, per topic, text only) ----------

const HISTORY_MAX_MESSAGES = 12;
const HISTORY_MAX_CHARS = 7000; // Script Properties allow about 9 KB per value.

function loadHistory_(topic) {
  return JSON.parse(prop_('HIST_' + topic, '[]'));
}

function saveHistory_(topic, history) {
  let h = history.slice(-HISTORY_MAX_MESSAGES);
  while (h.length && JSON.stringify(h).length > HISTORY_MAX_CHARS) h = h.slice(2);
  // The conversation must start with a user message.
  while (h.length && h[0].role !== 'user') h = h.slice(1);
  setProp_('HIST_' + topic, JSON.stringify(h));
}

function clearHistory_(topic) {
  PropertiesService.getScriptProperties().deleteProperty('HIST_' + topic);
}
