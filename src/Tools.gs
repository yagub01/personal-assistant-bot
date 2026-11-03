/**
 * Tools Claude can call, and their implementations.
 */

const TOPIC_ENUM = ['Briefing', 'Academics', 'Careers', 'Reminders', 'General'];

const TOOL_DEFS = [
  // ----- Calendar -----
  {
    name: 'calendar_list_events',
    description:
      'List events from all of the owner\'s visible calendars (Google Calendar, plus the subscribed Outlook/Harvard calendar) between two times. Use it for questions such as "what do I have tomorrow" or "when am I free".',
    input_schema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'Range start, ISO 8601 (e.g. 2026-11-05T00:00:00).' },
        end: { type: 'string', description: 'Range end, ISO 8601.' },
      },
      required: ['start', 'end'],
    },
  },
  {
    name: 'calendar_create_event',
    description:
      'Create an event. Defaults to the owner\'s primary Google Calendar. Subscribed calendars such as Outlook are read-only.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        start: { type: 'string', description: 'ISO 8601 date-time, or YYYY-MM-DD for all-day events.' },
        end: {
          type: 'string',
          description:
            'ISO 8601 date-time. For all-day events, the last day (YYYY-MM-DD), inclusive. If omitted, timed events last one hour.',
        },
        all_day: { type: 'boolean' },
        location: { type: 'string' },
        description: { type: 'string' },
        calendar_id: { type: 'string', description: 'Optional. Omit to use the primary calendar.' },
      },
      required: ['title', 'start'],
    },
  },
  {
    name: 'calendar_update_event',
    description:
      'Change an existing event. Get calendar_id and event_id from calendar_list_events. For recurring events, the change may apply to the whole series, so confirm with the owner first.',
    input_schema: {
      type: 'object',
      properties: {
        calendar_id: { type: 'string' },
        event_id: { type: 'string' },
        title: { type: 'string' },
        start: { type: 'string', description: 'New start, ISO 8601. Must be given together with end.' },
        end: { type: 'string', description: 'New end, ISO 8601.' },
        location: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['calendar_id', 'event_id'],
    },
  },
  {
    name: 'calendar_delete_event',
    description: 'Delete an event. Only when the owner has clearly asked for it.',
    input_schema: {
      type: 'object',
      properties: { calendar_id: { type: 'string' }, event_id: { type: 'string' } },
      required: ['calendar_id', 'event_id'],
    },
  },
  // ----- Google Tasks -----
  {
    name: 'tasks_list',
    description: 'List open tasks from all of the owner\'s Google Tasks lists (these also appear alongside Keep).',
    input_schema: {
      type: 'object',
      properties: { include_completed: { type: 'boolean', description: 'Also return completed tasks.' } },
    },
  },
  {
    name: 'task_create',
    description: 'Create a to-do in Google Tasks. Tasks have a due date but no due time.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        notes: { type: 'string' },
        due_date: { type: 'string', description: 'YYYY-MM-DD' },
        list_id: { type: 'string', description: 'Optional. Omit for the default list.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'task_update',
    description: 'Update a task, or mark it completed. Get list_id and task_id from tasks_list.',
    input_schema: {
      type: 'object',
      properties: {
        list_id: { type: 'string' },
        task_id: { type: 'string' },
        title: { type: 'string' },
        notes: { type: 'string' },
        due_date: { type: 'string', description: 'YYYY-MM-DD' },
        completed: { type: 'boolean' },
      },
      required: ['list_id', 'task_id'],
    },
  },
  {
    name: 'task_delete',
    description: 'Delete a task. Only when the owner has clearly asked for it.',
    input_schema: {
      type: 'object',
      properties: { list_id: { type: 'string' }, task_id: { type: 'string' } },
      required: ['list_id', 'task_id'],
    },
  },
  // ----- Telegram reminders -----
  {
    name: 'reminder_create',
    description:
      'Schedule a Telegram message to the owner at a specific time, posted in the Reminders topic. Use for "remind me at/in...".',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'What to remind the owner about, written as the reminder message.' },
        time: { type: 'string', description: 'When, ISO 8601 date-time.' },
      },
      required: ['text', 'time'],
    },
  },
  {
    name: 'reminders_list',
    description: 'List pending reminders.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'reminder_cancel',
    description: 'Cancel a pending reminder by ID.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  // ----- Memory and notes -----
  {
    name: 'memory_save',
    description:
      'Save a lasting fact about the owner to shared memory, visible in every topic: people and their details, preferences, routines, important dates, goals. Write it as a short, self-contained sentence.',
    input_schema: {
      type: 'object',
      properties: {
        fact: { type: 'string' },
        category: { type: 'string', description: 'For example: person, preference, academics, career, routine, date.' },
      },
      required: ['fact'],
    },
  },
  {
    name: 'memory_delete',
    description: 'Delete a saved memory by its ID, for example when it is outdated or the owner asks to forget it.',
    input_schema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'topic_notes_append',
    description:
      'Append a note to a topic\'s notes document (its long-term record). Defaults to the current topic. Use for information worth keeping in that area, such as course details, networking contacts, application status, or ideas.',
    input_schema: {
      type: 'object',
      properties: {
        note: { type: 'string' },
        topic: { type: 'string', enum: TOPIC_ENUM },
      },
      required: ['note'],
    },
  },
  {
    name: 'topic_notes_read',
    description: 'Read another topic\'s notes document. The current topic\'s notes are already in your context.',
    input_schema: {
      type: 'object',
      properties: { topic: { type: 'string', enum: TOPIC_ENUM } },
      required: ['topic'],
    },
  },
  {
    name: 'save_journal_entry',
    description:
      'Save the owner\'s current message to the journal exactly as they said or wrote it. Use when the message is a reflection on their day, thoughts, or feelings meant for the journal. Takes no input: the original message is saved verbatim by the system.',
    input_schema: { type: 'object', properties: {} },
  },
  // ----- Google Drive -----
  {
    name: 'drive_search',
    description: 'Search the owner\'s Google Drive by file name and content. Returns up to 10 files with links.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Words to search for.' } },
      required: ['query'],
    },
  },
  {
    name: 'drive_read_file',
    description: 'Read the text of a Google Doc, Google Sheet, or plain-text file by ID.',
    input_schema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] },
  },
  {
    name: 'drive_create_document',
    description: 'Create a new Google Doc in the assistant\'s Drive folder and return its link.',
    input_schema: {
      type: 'object',
      properties: { title: { type: 'string' }, content: { type: 'string' } },
      required: ['title', 'content'],
    },
  },
];

function webSearchTool_(model) {
  // Haiku models take the basic web search version.
  const type = /haiku/.test(model) ? 'web_search_20250305' : 'web_search_20260209';
  return { type: type, name: 'web_search', max_uses: 5 };
}

/**
 * Runs one tool_use block and returns the tool_result block.
 * state = { ctx, rawText, isVoice }
 */
function runTool_(block, state) {
  let result;
  let isError = false;
  try {
    result = TOOL_IMPLS[block.name](block.input || {}, state);
  } catch (err) {
    isError = true;
    result = 'Error: ' + (err && err.message ? err.message : err);
    console.error('Tool ' + block.name + ' failed: ' + (err && err.stack ? err.stack : err));
  }
  if (result === undefined) result = 'Done.';
  const content = typeof result === 'string' ? result : JSON.stringify(result);
  return { type: 'tool_result', tool_use_id: block.id, content: truncate_(content, 20000), is_error: isError };
}

const TOOL_IMPLS = {
  // ----- Calendar -----
  calendar_list_events: function (input) {
    return listEvents_(parseWhen_(input.start), parseWhen_(input.end));
  },

  calendar_create_event: function (input) {
    const cal = input.calendar_id ? CalendarApp.getCalendarById(input.calendar_id) : CalendarApp.getDefaultCalendar();
    if (!cal) throw new Error('Calendar not found: ' + input.calendar_id);
    const options = {};
    if (input.location) options.location = input.location;
    if (input.description) options.description = input.description;
    const allDay = input.all_day || /^\d{4}-\d{2}-\d{2}$/.test(String(input.start).trim());
    let ev;
    if (allDay) {
      const startDay = parseWhen_(String(input.start).slice(0, 10));
      if (input.end) {
        // Calendar end dates are exclusive, so add one day to the inclusive last day.
        const lastDay = parseWhen_(String(input.end).slice(0, 10));
        const endExclusive = new Date(lastDay.getTime() + 24 * 3600 * 1000);
        ev = cal.createAllDayEvent(input.title, startDay, endExclusive, options);
      } else {
        ev = cal.createAllDayEvent(input.title, startDay, options);
      }
    } else {
      const start = parseWhen_(input.start);
      const end = input.end ? parseWhen_(input.end) : new Date(start.getTime() + 3600 * 1000);
      ev = cal.createEvent(input.title, start, end, options);
    }
    return { created: true, calendar: cal.getName(), calendar_id: cal.getId(), event_id: ev.getId() };
  },

  calendar_update_event: function (input) {
    const ev = findEvent_(input.calendar_id, input.event_id);
    if (input.title) ev.setTitle(input.title);
    if (input.location !== undefined) ev.setLocation(input.location);
    if (input.description !== undefined) ev.setDescription(input.description);
    if (input.start || input.end) {
      if (!input.start || !input.end) throw new Error('Give both start and end when changing the time.');
      ev.setTime(parseWhen_(input.start), parseWhen_(input.end));
    }
    return { updated: true, title: ev.getTitle() };
  },

  calendar_delete_event: function (input) {
    const ev = findEvent_(input.calendar_id, input.event_id);
    const title = ev.getTitle();
    ev.deleteEvent();
    return { deleted: true, title: title };
  },

  // ----- Google Tasks -----
  tasks_list: function (input) {
    return listTasks_(!!input.include_completed);
  },

  task_create: function (input) {
    const listId = input.list_id || '@default';
    const resource = { title: input.title };
    if (input.notes) resource.notes = input.notes;
    if (input.due_date) resource.due = toTaskDue_(input.due_date);
    const task = Tasks.Tasks.insert(resource, listId);
    return { created: true, task_id: task.id, list_id: listId };
  },

  task_update: function (input) {
    const resource = {};
    if (input.title) resource.title = input.title;
    if (input.notes !== undefined) resource.notes = input.notes;
    if (input.due_date) resource.due = toTaskDue_(input.due_date);
    if (input.completed === true) resource.status = 'completed';
    if (input.completed === false) {
      resource.status = 'needsAction';
      resource.completed = null;
    }
    Tasks.Tasks.patch(resource, input.list_id, input.task_id);
    return { updated: true };
  },

  task_delete: function (input) {
    Tasks.Tasks.remove(input.list_id, input.task_id);
    return { deleted: true };
  },

  // ----- Reminders -----
  reminder_create: function (input) {
    const when = parseWhen_(input.time);
    if (when.getTime() < Date.now() - 60 * 1000) throw new Error('That time is in the past: ' + isoLocal_(when));
    const item = addReminder_(input.text, when);
    return { scheduled: true, id: item.id, time: isoLocal_(when) };
  },

  reminders_list: function () {
    const list = loadReminders_();
    if (!list.length) return 'No pending reminders.';
    return list.map(function (r) {
      return { id: r.id, time: isoLocal_(new Date(r.at)), text: r.text };
    });
  },

  reminder_cancel: function (input) {
    return cancelReminder_(input.id) ? 'Reminder cancelled.' : 'No reminder with that ID.';
  },

  // ----- Memory and notes -----
  memory_save: function (input) {
    return { saved: true, id: memorySave_(input.fact, input.category) };
  },

  memory_delete: function (input) {
    return memoryDelete_(input.id) ? 'Memory deleted.' : 'No memory with that ID.';
  },

  topic_notes_append: function (input, state) {
    const topic = input.topic || state.ctx.topic;
    appendTopicNote_(topic, input.note);
    return 'Saved to ' + (TOPIC_DOCS[topic] || TOPIC_DOCS.General) + '.';
  },

  topic_notes_read: function (input) {
    return readTopicNotes_(input.topic, 15000);
  },

  save_journal_entry: function (input, state) {
    if (state.savedJournal) return 'Already saved.';
    if (!state.rawText) throw new Error('There is no text in this message to save.');
    appendJournalEntry_(state.rawText, state.isVoice);
    state.savedJournal = true;
    return 'Saved to the journal verbatim.';
  },

  // ----- Google Drive -----
  drive_search: function (input) {
    const q = String(input.query).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const files = DriveApp.searchFiles("trashed = false and (title contains '" + q + "' or fullText contains '" + q + "')");
    const out = [];
    while (files.hasNext() && out.length < 10) {
      const f = files.next();
      out.push({
        name: f.getName(),
        file_id: f.getId(),
        url: f.getUrl(),
        type: f.getMimeType(),
        modified: isoLocal_(f.getLastUpdated()),
      });
    }
    return out.length ? out : 'No files found.';
  },

  drive_read_file: function (input) {
    const file = DriveApp.getFileById(input.file_id);
    const mime = file.getMimeType();
    if (mime === MimeType.GOOGLE_DOCS) {
      return truncate_(DocumentApp.openById(file.getId()).getBody().getText(), 20000);
    }
    if (mime === MimeType.GOOGLE_SHEETS) {
      const values = SpreadsheetApp.openById(file.getId()).getSheets()[0].getDataRange().getDisplayValues();
      return truncate_(
        values
          .map(function (r) {
            return r.join(' | ');
          })
          .join('\n'),
        20000
      );
    }
    if (/^text\/|json|csv|xml/.test(mime)) {
      return truncate_(file.getBlob().getDataAsString(), 20000);
    }
    return 'This file type (' + mime + ') cannot be read as text. Link: ' + file.getUrl();
  },

  drive_create_document: function (input) {
    const doc = DocumentApp.create(input.title);
    doc.getBody().setText(input.content);
    doc.saveAndClose();
    const folderId = prop_('FOLDER_ID');
    if (folderId) DriveApp.getFileById(doc.getId()).moveTo(DriveApp.getFolderById(folderId));
    return { created: true, url: doc.getUrl() };
  },
};

// ---------- Helpers shared with the scheduler ----------

/** Events from all visible calendars between start and end, sorted by start time. */
function listEvents_(start, end) {
  const out = [];
  CalendarApp.getAllCalendars().forEach(function (cal) {
    if (cal.isHidden()) return;
    cal.getEvents(start, end).forEach(function (ev) {
      const allDay = ev.isAllDayEvent();
      out.push({
        calendar: cal.getName(),
        calendar_id: cal.getId(),
        event_id: ev.getId(),
        title: ev.getTitle(),
        all_day: allDay,
        start: allDay ? fmt_(ev.getAllDayStartDate(), 'yyyy-MM-dd') : isoLocal_(ev.getStartTime()),
        end: allDay ? fmt_(ev.getAllDayEndDate(), 'yyyy-MM-dd') : isoLocal_(ev.getEndTime()),
        location: ev.getLocation() || undefined,
        _startMs: ev.getStartTime().getTime(),
      });
    });
  });
  out.sort(function (a, b) {
    return a._startMs - b._startMs;
  });
  return out.slice(0, 150).map(function (e) {
    delete e._startMs;
    return e;
  });
}

function findEvent_(calendarId, eventId) {
  const cal = CalendarApp.getCalendarById(calendarId);
  if (!cal) throw new Error('Calendar not found: ' + calendarId);
  const ev = cal.getEventById(eventId);
  if (!ev) throw new Error('Event not found: ' + eventId);
  return ev;
}

/** Open (or all) tasks across every task list. */
function listTasks_(includeCompleted) {
  const out = [];
  const lists = Tasks.Tasklists.list({ maxResults: 100 }).items || [];
  lists.forEach(function (list) {
    let pageToken;
    do {
      const page = Tasks.Tasks.list(list.id, {
        showCompleted: includeCompleted,
        showHidden: includeCompleted,
        maxResults: 100,
        pageToken: pageToken,
      });
      (page.items || []).forEach(function (t) {
        if (!t.title) return;
        out.push({
          list: list.title,
          list_id: list.id,
          task_id: t.id,
          title: t.title,
          notes: t.notes || undefined,
          due_date: t.due ? t.due.slice(0, 10) : undefined,
          status: t.status,
        });
      });
      pageToken = page.nextPageToken;
    } while (pageToken);
  });
  return out;
}

function toTaskDue_(dateString) {
  const d = String(dateString).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('due_date must be YYYY-MM-DD.');
  return d + 'T00:00:00.000Z';
}
