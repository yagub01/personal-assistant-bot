/**
 * Proactive messages. setup() installs a trigger that runs tick() every minute.
 *
 * - Reminders: sent to the Reminders topic when due.
 * - Event alerts: checked every 5 minutes; sent about ALERT_MINUTES before each timed event.
 * - Morning briefing at BRIEFING_TIME and journal prompt at JOURNAL_TIME, in the Briefing topic.
 */

function tick() {
  if (!prop_('GROUP_CHAT_ID')) return; // /setup has not been run yet.
  const now = new Date();

  takeDueReminders_().forEach(function (r) {
    sendToTopic_('Reminders', 'Reminder: ' + r.text);
  });

  if (now.getMinutes() % 5 === 0) {
    try {
      sendEventAlerts_(now);
    } catch (err) {
      console.error('Event alerts failed: ' + err);
    }
  }

  runDailyOnce_('BRIEFING', prop_('BRIEFING_TIME'), now, sendBriefing_);
  runDailyOnce_('JOURNAL', prop_('JOURNAL_TIME'), now, sendJournalPrompt_);
}

/** Runs fn once per day, at or within an hour after the given HH:mm time. */
function runDailyOnce_(name, hhmm, now, fn) {
  const parts = String(hhmm).split(':');
  const target = Number(parts[0]) * 60 + Number(parts[1] || 0);
  const current = Number(fmt_(now, 'H')) * 60 + Number(fmt_(now, 'm'));
  if (current < target || current > target + 60) return;
  const today = fmt_(now, 'yyyy-MM-dd');
  const key = 'LAST_' + name;
  const claimed = withLock_(function () {
    if (prop_(key) === today) return false;
    setProp_(key, today);
    return true;
  });
  if (claimed) fn();
}

function sendEventAlerts_(now) {
  const minutes = Number(prop_('ALERT_MINUTES'));
  // Checks run every 5 minutes, so look 5 minutes past the alert window.
  const until = new Date(now.getTime() + (minutes + 5) * 60 * 1000);
  const cache = CacheService.getScriptCache();
  CalendarApp.getAllCalendars().forEach(function (cal) {
    if (cal.isHidden()) return;
    cal.getEvents(now, until).forEach(function (ev) {
      if (ev.isAllDayEvent()) return;
      const start = ev.getStartTime();
      if (start.getTime() < now.getTime()) return; // Already started.
      const key = 'alert_' + Utilities.base64EncodeWebSafe(ev.getId() + '|' + start.getTime()).slice(0, 200);
      if (cache.get(key)) return;
      cache.put(key, '1', 21600);
      const mins = Math.max(1, Math.round((start.getTime() - now.getTime()) / 60000));
      const where = ev.getLocation() ? '\nWhere: ' + ev.getLocation() : '';
      sendToTopic_('Reminders', 'In ' + mins + ' min (' + fmt_(start, 'HH:mm') + '): ' + ev.getTitle() + where);
    });
  });
}

function sendBriefing_() {
  const now = new Date();
  const dayStart = parseWhen_(fmt_(now, 'yyyy-MM-dd'));
  const dayEnd = nextMidnight_(dayStart);
  const today = fmt_(now, 'yyyy-MM-dd');

  const lines = ['Good morning. ' + fmt_(now, 'EEEE, MMMM d') + '.', ''];
  lines.push('Today:');
  lines.push(formatEvents_(listEvents_(dayStart, dayEnd)));

  const tasks = safeTasks_().filter(function (t) {
    return t.due_date && t.due_date <= today;
  });
  lines.push('', 'Tasks due today or overdue:');
  lines.push(
    tasks.length
      ? tasks
          .map(function (t) {
            return '- ' + t.title + (t.due_date < today ? ' (overdue, ' + t.due_date + ')' : '');
          })
          .join('\n')
      : '- None'
  );

  const reminders = loadReminders_().filter(function (r) {
    return r.at < dayEnd.getTime();
  });
  if (reminders.length) {
    lines.push('', 'Reminders today:');
    reminders.forEach(function (r) {
      lines.push('- ' + fmt_(new Date(r.at), 'HH:mm') + ' ' + r.text);
    });
  }
  sendToTopic_('Briefing', lines.join('\n'));
}

function sendJournalPrompt_() {
  const now = new Date();
  const tomorrowStart = nextMidnight_(parseWhen_(fmt_(now, 'yyyy-MM-dd')));
  const tomorrowEnd = nextMidnight_(tomorrowStart);
  const tomorrow = fmt_(tomorrowStart, 'yyyy-MM-dd');

  const lines = ['Tomorrow, ' + fmt_(tomorrowStart, 'EEEE, MMMM d') + ':'];
  lines.push(formatEvents_(listEvents_(tomorrowStart, tomorrowEnd)));
  const tasks = safeTasks_().filter(function (t) {
    return t.due_date && t.due_date <= tomorrow;
  });
  if (tasks.length) {
    lines.push('', 'Tasks due by tomorrow:');
    tasks.forEach(function (t) {
      lines.push('- ' + t.title);
    });
  }
  lines.push('', 'How was your day? Reply here by text or voice and I will save it to your journal.');
  sendToTopic_('Briefing', lines.join('\n'));
}

/** Local midnight of the following day. Robust to 23- and 25-hour daylight-saving days. */
function nextMidnight_(midnight) {
  return parseWhen_(fmt_(new Date(midnight.getTime() + 26 * 3600 * 1000), 'yyyy-MM-dd'));
}

function formatEvents_(events) {
  if (!events.length) return '- No events';
  return events
    .map(function (e) {
      const time = e.all_day ? 'All day' : e.start.slice(11, 16) + '-' + e.end.slice(11, 16);
      return '- ' + time + ' ' + e.title + (e.location ? ' (' + e.location + ')' : '');
    })
    .join('\n');
}

function safeTasks_() {
  try {
    return listTasks_(false);
  } catch (err) {
    console.error('Tasks failed: ' + err);
    return [];
  }
}
