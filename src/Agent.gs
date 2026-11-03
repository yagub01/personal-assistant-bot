/**
 * The Claude agent: system prompt, API call, and tool-use loop.
 */

const ANTHROPIC_VERSION = '2026-10-21';
const MAX_AGENT_STEPS = 12;
const MAX_AGENT_MS = 4.5 * 60 * 1000; // Apps Script stops a run at 6 minutes.

// Models that accept the server-side refusal fallback ("default" form).
const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5'];

const STATIC_INSTRUCTIONS = [
  'You are a personal assistant for one person, the owner. You run inside a private Telegram group where the owner writes or sends voice messages. Voice messages reach you as transcripts.',
  '',
  'The group has five topics, each a separate thread:',
  '- Briefing: the morning briefing and the 11 pm journal prompt are posted here. When the owner talks about their day, thoughts, or feelings here, call save_journal_entry, then reply with one short acknowledgment. Do not analyze or summarize the entry unless asked.',
  '- Academics: courses, assignments, exams, study notes.',
  '- Careers: recruiting, networking, applications, interviews. When the owner mentions meeting someone, save the contact to the Careers notes (name, organization, role, where you met, what you discussed, any follow-up) and offer a follow-up reminder or task if it fits.',
  '- Reminders: reminders and event alerts are posted here.',
  '- General: everything else.',
  'You can do anything in any topic. The current topic only tells you the likely context.',
  '',
  'Memory:',
  '- Shared memory (a Google Sheet) holds lasting facts and is shown to you in every topic. Save facts that will matter later (people, preferences, routines, important dates, goals) with memory_save without asking. Do not save one-off details. When a fact changes, delete the old entry and save the new one.',
  '- Each topic has a notes document, shown to you below for the current topic. Use topic_notes_append for information worth keeping in that area, and topic_notes_read to look at another topic\'s notes.',
  '',
  'Calendar, tasks, and reminders:',
  '- Calendars include the owner\'s Google Calendar and a read-only subscribed Outlook (Harvard) calendar, which can lag a few hours. Create events in the primary Google Calendar unless told otherwise.',
  '- A reminder is a Telegram message at a specific time ("remind me at 6 to call the bank"). A task is a to-do in Google Tasks ("add a task to finish the essay by Friday"). Choose the one that fits; if the owner gives a time and wants to be pinged, it is a reminder. Reminders can repeat daily, weekly on chosen days, or monthly.',
  '- Interpret relative dates ("tomorrow", "next Thursday") from the current date and time given below. Use ISO 8601 times in the owner\'s time zone.',
  '- Never delete anything unless the owner clearly asked. If a request is ambiguous and the action is hard to undo, ask one short question first. Otherwise act, then confirm what you did in one or two lines.',
  '',
  'Style:',
  '- Telegram shows your reply as plain text. Do not use Markdown: no asterisks, no # headings, no tables. Use short lines and simple hyphen lists.',
  '- Be brief and direct. When you have done something, state what you did, including the date and time for events and reminders.',
  '- Use web_search for current information, and say when you are unsure.',
].join('\n');

function buildSystem_(ctx) {
  const now = new Date();
  const dynamic = [
    'Current date and time: ' + fmt_(now, 'EEEE, MMMM d, yyyy, HH:mm') + ' (' + tz_() + ', ' + isoLocal_(now) + ').',
    'Current topic: ' + ctx.topic + '.',
    '',
    'Shared memory (ID in brackets):',
    memoryText_(),
    '',
    'Notes for the current topic (' + (TOPIC_DOCS[ctx.topic] || TOPIC_DOCS.General) + '):',
    readTopicNotes_(ctx.topic, 12000),
  ].join('\n');
  return [
    { type: 'text', text: STATIC_INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamic },
  ];
}

function callClaude_(system, tools, messages) {
  const model = prop_('CLAUDE_MODEL');
  const body = {
    model: model,
    max_tokens: 16000,
    cache_control: { type: 'ephemeral' },
    output_config: { effort: prop_('CLAUDE_EFFORT') },
    system: system,
    messages: messages,
  };
  if (tools && tools.length) body.tools = tools;
  const headers = {
    'x-api-key': requireProp_('ANTHROPIC_API_KEY'),
    'anthropic-version': ANTHROPIC_VERSION,
  };
  if (FALLBACK_MODELS.indexOf(model) !== -1) {
    // If a safety classifier declines, the API retries on a fallback model in the same call.
    body.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    const text = res.getContentText();
    if (code === 200) return JSON.parse(text);
    const retryable = code === 429 || code === 529 || code >= 500;
    if (!retryable || attempt === 2) {
      throw new Error('Claude API error ' + code + ': ' + truncate_(text, 600));
    }
    Utilities.sleep(2000 * (attempt + 1));
  }
}

/**
 * Runs one user turn.
 * ctx = { chatId, threadId, topic }
 * userBlocks = content blocks for the new user message (text, image, document)
 * historyText = plain-text version of the user message, kept in short-term history
 * rawText = the message text or transcript, used for verbatim journal saving
 * Returns the reply text.
 */
function runAgent_(ctx, userBlocks, historyText, rawText, isVoice) {
  const started = Date.now();
  const model = prop_('CLAUDE_MODEL');
  // The system prompt and tools stay identical for every request within this turn.
  const system = buildSystem_(ctx);
  const tools = TOOL_DEFS.concat([webSearchTool_(model)]);
  const history = loadHistory_(ctx.topic);

  // Earlier turns are replayed as plain text only. Thinking blocks are passed back
  // unchanged within this turn's tool loop and are never stored between turns.
  const messages = history.concat([{ role: 'user', content: userBlocks }]);
  const state = { ctx: ctx, rawText: rawText, isVoice: isVoice, savedJournal: false };

  let reply = '';
  for (let step = 0; step < MAX_AGENT_STEPS; step++) {
    if (Date.now() - started > MAX_AGENT_MS) {
      reply = 'This is taking too long, so I stopped. Please try again or split the request.';
      break;
    }
    const res = callClaude_(system, tools, messages);

    if (res.stop_reason === 'refusal') {
      reply = 'I cannot help with that request.';
      break;
    }

    const last = messages[messages.length - 1];
    if (last.role === 'assistant') {
      // Continuing a paused turn: the new content extends the same assistant message.
      last.content = last.content.concat(res.content);
    } else {
      messages.push({ role: 'assistant', content: res.content });
    }

    if (res.stop_reason === 'tool_use') {
      const toolUses = res.content.filter(function (b) {
        return b.type === 'tool_use';
      });
      const results = toolUses.map(function (b) {
        return runTool_(b, state);
      });
      messages.push({ role: 'user', content: results });
      sendTyping_(ctx.chatId, ctx.threadId);
      continue;
    }
    if (res.stop_reason === 'pause_turn') continue;

    reply = textOf_(messages[messages.length - 1].content);
    if (res.stop_reason === 'max_tokens') reply += '\n\n(Reply cut off at the length limit.)';
    break;
  }
  if (!reply) reply = 'I did not manage to finish that. Please try again.';

  saveHistory_(
    ctx.topic,
    history.concat([
      { role: 'user', content: truncate_(historyText, 1500) },
      { role: 'assistant', content: truncate_(reply, 1500) },
    ])
  );
  return reply;
}

function textOf_(content) {
  return content
    .filter(function (b) {
      return b.type === 'text';
    })
    .map(function (b) {
      return b.text;
    })
    .join('\n')
    .trim();
}
