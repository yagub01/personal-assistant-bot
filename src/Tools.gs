/**
 * Tools Claude can call, and their implementations.
 */

const TOPIC_ENUM = ['Briefing', 'Academics', 'Careers', 'Reminders', 'General'];

const TOOL_DEFS = [
  // ----- Calendar -----
  {
    name: 'calendar_list_events',
    description:
      'List events between two local times from the calendars shown in the owner\'s Google Calendar, including the subscribed Outlook (Harvard) calendar. calendar_id, event_id, and start together identify an event for changes. recurring is true for events in a repeating series. Timed events have start and end; all-day events have start and last_day, both inclusive dates.',
    input_schema: {
      type: 'object',
      properties: {
        start: { type: 'string', description: 'Range start, local date-time, e.g. 2026-11-05T00:00:00.' },
        end: { type: 'string', description: 'Range end, local date-time.' },
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
        start: {
          type: 'string',
          description: 'Local date-time, e.g. 2026-11-05T13:00:00, or YYYY-MM-DD for an all-day event.',
        },
        end: {
          type: 'string',
          description:
            'Local date-time. For an all-day event, the last day (YYYY-MM-DD), inclusive. If omitted, a timed event lasts one hour and an all-day event one day.',
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
      'Change an event. Identify it with calendar_id, event_id, and occurrence_start, copied exactly from calendar_list_events. For a recurring event, only that occurrence changes unless apply_to_series is true; for a whole series, only the title, location, and description can be changed. A YYYY-MM-DD start makes the event all-day; a date-time start makes it timed.',
    input_schema: {
      type: 'object',
      properties: {
        calendar_id: { type: 'string' },
        event_id: { type: 'string' },
        occurrence_start: { type: 'string', description: 'The event\'s start exactly as calendar_list_events returned it.' },
        apply_to_series: {
          type: 'boolean',
          description: 'Recurring events only: change every occurrence. Use only when the owner clearly means the whole series.',
        },
        title: { type: 'string' },
        start: { type: 'string', description: 'New start: local date-time, or YYYY-MM-DD for all-day.' },
        end: {
          type: 'string',
          description:
            'New end: local date-time, or the inclusive last day (YYYY-MM-DD) for all-day. If omitted when start changes, the event keeps its length.',
        },
        location: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['calendar_id', 'event_id', 'occurrence_start'],
    },
  },
  {
    name: 'calendar_delete_event',
    description:
      'Delete an event, only when the owner has clearly asked. Identify it with calendar_id, event_id, and occurrence_start from calendar_list_events. For a recurring event, only that occurrence is deleted unless apply_to_series is true.',
    input_schema: {
      type: 'object',
      properties: {
        calendar_id: { type: 'string' },
        event_id: { type: 'string' },
        occurrence_start: { type: 'string', description: 'The event\'s start exactly as calendar_list_events returned it.' },
        apply_to_series: {
          type: 'boolean',
          description: 'Recurring events only: delete every occurrence. Use only when the owner clearly asked for that.',
        },
      },
      required: ['calendar_id', 'event_id', 'occurrence_start'],
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
      'Schedule a Telegram message to the owner at a specific time, posted in the Reminders topic. Use for "remind me at/in..." and for repeating reminders ("every Monday at 9", "every day at 8 pm", "on the 1st of each month").',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'What to remind the owner about, written as the reminder message.' },
        time: {
          type: 'string',
          description:
            'When, as local date-time (e.g. 2026-11-05T18:00:00). For a repeating reminder, the first occurrence; later ones keep the same time of day.',
        },
        repeat: {
          type: 'object',
          description: 'Optional. Omit for a one-time reminder.',
          properties: {
            frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
            interval: { type: 'integer', description: 'Every N days, weeks, or months. Default 1.' },
            weekdays: {
              type: 'array',
              items: { type: 'string', enum: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] },
              description: 'Weekly only. Defaults to the weekday of time. Use MO-FR for weekdays.',
            },
            until: { type: 'string', description: 'Optional last date, YYYY-MM-DD.' },
          },
          required: ['frequency'],
        },
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
    description: 'Cancel a reminder by ID. For a repeating reminder, this cancels the whole series.',
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
    let ev;
    if (input.all_day || isDateOnly_(input.start)) {
      const firstDay = parseWhen_(String(input.start).trim().slice(0, 10));
      const lastDay = input.end ? parseWhen_(String(input.end).trim().slice(0, 10)) : firstDay;
      if (lastDay.getTime() < firstDay.getTime()) throw new Error('The last day is before the first day.');
      // The calendar's end date is exclusive: the day after the last day.
      ev = cal.createAllDayEvent(input.title, firstDay, nextMidnight_(lastDay), options);
    } else {
      const start = parseWhen_(input.start);
      const end = input.end ? parseWhen_(input.end) : new Date(start.getTime() + 3600 * 1000);
      if (end.getTime() <= start.getTime()) throw new Error('The end must be after the start.');
      ev = cal.createEvent(input.title, start, end, options);
    }
    return { created: true, calendar: cal.getName(), calendar_id: cal.getId(), event_id: ev.getId(), start: eventStart_(ev) };
  },

  calendar_update_event: function (input) {
    const ev = findOccurrence_(input.calendar_id, input.event_id, input.occurrence_start);
    const recurring = ev.isRecurringEvent();
    if (recurring && input.apply_to_series) {
      if (input.start || input.end) {
        throw new Error(
          'The time of a whole recurring series cannot be changed here. Move single occurrences, or change the series in Google Calendar.'
        );
      }
      const series = ev.getEventSeries();
      if (input.title) series.setTitle(input.title);
      if (input.location !== undefined) series.setLocation(input.location);
      if (input.description !== undefined) series.setDescription(input.description);
      return { updated: 'whole series', title: series.getTitle() };
    }
    if (input.title) ev.setTitle(input.title);
    if (input.location !== undefined) ev.setLocation(input.location);
    if (input.description !== undefined) ev.setDescription(input.description);
    if (input.start || input.end) setEventTime_(ev, input.start, input.end);
    return { updated: recurring ? 'this occurrence only' : 'event', title: ev.getTitle(), start: eventStart_(ev) };
  },

  calendar_delete_event: function (input) {
    const ev = findOccurrence_(input.calendar_id, input.event_id, input.occurrence_start);
    const title = ev.getTitle();
    if (ev.isRecurringEvent()) {
      if (input.apply_to_series) {
        ev.getEventSeries().deleteEventSeries();
        return { deleted: 'whole series', title: title };
      }
      ev.deleteEvent();
      return { deleted: 'this occurrence only', title: title };
    }
    ev.deleteEvent();
    return { deleted: 'event', title: title };
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
    if (!input.repeat && when.getTime() < Date.now() - 60 * 1000) {
      throw new Error('That time is in the past: ' + isoLocal_(when));
    }
    const item = addReminder_(input.text, when, input.repeat);
    return { scheduled: true, id: item.id, next: isoLocal_(new Date(item.at)), repeats: describeRepeat_(item) };
  },

  reminders_list: function () {
    const list = loadReminders_();
    if (!list.length) return 'No pending reminders.';
    return list.map(function (r) {
      return { id: r.id, next: isoLocal_(new Date(r.at)), repeats: describeRepeat_(r), text: r.text };
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

/** Calendars shown in Google Calendar: not hidden from the calendar list, and checked. */
function visibleCalendars_() {
  return CalendarApp.getAllCalendars().filter(function (cal) {
    return !cal.isHidden() && cal.isSelected();
  });
}

/** An event's start as listed to Claude: YYYY-MM-DD for all-day events, local date-time otherwise. */
function eventStart_(ev) {
  return ev.isAllDayEvent() ? fmt_(ev.getAllDayStartDate(), 'yyyy-MM-dd') : isoLocal_(ev.getStartTime());
}

/** Inclusive last day of an all-day event. getAllDayEndDate() is the exclusive end, the day after the last day. */
function allDayLastDay_(ev) {
  const first = fmt_(ev.getAllDayStartDate(), 'yyyy-MM-dd');
  const last = ymdFromDayNumber_(dayNumber_(fmt_(ev.getAllDayEndDate(), 'yyyy-MM-dd')) - 1);
  return last < first ? first : last;
}

/** Events from the visible calendars between start and end, sorted by start time. */
function listEvents_(start, end) {
  const found = [];
  visibleCalendars_().forEach(function (cal) {
    cal.getEvents(start, end).forEach(function (ev) {
      const item = {
        calendar: cal.getName(),
        calendar_id: cal.getId(),
        event_id: ev.getId(),
        title: ev.getTitle(),
        all_day: ev.isAllDayEvent(),
        start: eventStart_(ev),
      };
      if (item.all_day) item.last_day = allDayLastDay_(ev);
      else item.end = isoLocal_(ev.getEndTime());
      if (ev.isRecurringEvent()) item.recurring = true;
      if (ev.getLocation()) item.location = ev.getLocation();
      found.push({ startMs: ev.getStartTime().getTime(), item: item });
    });
  });
  found.sort(function (a, b) {
    return a.startMs - b.startMs;
  });
  return found.slice(0, 150).map(function (f) {
    return f.item;
  });
}

/**
 * Finds one specific occurrence from its calendar, event ID, and start as listed by calendar_list_events.
 * getEventById() is not used: for a recurring event it does not return the occurrence the owner means.
 */
function findOccurrence_(calendarId, eventId, occurrenceStart) {
  const cal = CalendarApp.getCalendarById(calendarId);
  if (!cal) throw new Error('Calendar not found: ' + calendarId);
  if (!occurrenceStart) throw new Error('occurrence_start is required: copy the event\'s start from calendar_list_events.');
  const target = String(occurrenceStart).trim();
  const dateOnly = isDateOnly_(target);
  const t = parseWhen_(target);
  const from = dateOnly ? t : new Date(t.getTime() - 60 * 1000);
  const to = dateOnly ? nextMidnight_(t) : new Date(t.getTime() + 60 * 1000);
  const matches = cal.getEvents(from, to).filter(function (ev) {
    if (ev.getId() !== eventId) return false;
    return dateOnly
      ? ev.isAllDayEvent() && fmt_(ev.getAllDayStartDate(), 'yyyy-MM-dd') === target
      : !ev.isAllDayEvent() && Math.abs(ev.getStartTime().getTime() - t.getTime()) < 60 * 1000;
  });
  if (!matches.length) {
    throw new Error('No event with that ID starts at ' + target + '. List the events again and copy the exact start.');
  }
  return matches[0];
}

/**
 * Moves or resizes an event. A YYYY-MM-DD start makes it all-day (end = inclusive last day);
 * a date-time start makes it timed. If only start is given, the event keeps its length.
 */
function setEventTime_(ev, startStr, endStr) {
  const toAllDay = startStr ? isDateOnly_(startStr) : ev.isAllDayEvent();
  if (toAllDay) {
    const firstDay = startStr ? parseWhen_(String(startStr).trim()) : ev.getAllDayStartDate();
    let lastDay;
    if (endStr) {
      lastDay = parseWhen_(String(endStr).trim().slice(0, 10));
    } else if (ev.isAllDayEvent()) {
      const days = dayNumber_(allDayLastDay_(ev)) - dayNumber_(fmt_(ev.getAllDayStartDate(), 'yyyy-MM-dd'));
      lastDay = addDays_(firstDay, days);
    } else {
      lastDay = firstDay;
    }
    if (lastDay.getTime() < firstDay.getTime()) throw new Error('The last day is before the first day.');
    ev.setAllDayDates(firstDay, nextMidnight_(lastDay));
    return;
  }
  const start = startStr ? parseWhen_(startStr) : ev.getStartTime();
  let end;
  if (endStr) {
    end = parseWhen_(endStr);
  } else {
    const length = ev.isAllDayEvent() ? 3600 * 1000 : ev.getEndTime().getTime() - ev.getStartTime().getTime();
    end = new Date(start.getTime() + length);
  }
  if (end.getTime() <= start.getTime()) throw new Error('The end must be after the start.');
  ev.setTime(start, end);
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
