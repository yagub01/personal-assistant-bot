/**
 * Webhook entry point and message handling.
 */

function doPost(e) {
  try {
    if (!e || !e.parameter || e.parameter.secret !== prop_('WEBHOOK_SECRET')) return ok_();
    const update = JSON.parse(e.postData.contents);
    if (isDuplicateUpdate_(update.update_id)) return ok_();
    if (update.message) handleMessage_(update.message);
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
  }
  return ok_();
}

function doGet() {
  return HtmlService.createHtmlOutput('The assistant is running.');
}

function ok_() {
  return HtmlService.createHtmlOutput('ok');
}

/** Telegram resends an update if it does not get a timely answer; process each update once. */
function isDuplicateUpdate_(updateId) {
  return !claimOnce_('update_' + updateId, 21600);
}

function handleMessage_(msg) {
  const fromId = String(msg.from && msg.from.id);
  const chatId = String(msg.chat.id);
  const isPrivate = msg.chat.type === 'private';
  const ownerId = prop_('OWNER_TELEGRAM_ID');

  if (!ownerId) {
    if (isPrivate) {
      sendText_(chatId, null, 'Your Telegram user ID is ' + fromId + '. Save it as the Script Property OWNER_TELEGRAM_ID.');
    }
    return;
  }
  if (fromId !== ownerId) return;

  const text = (msg.text || msg.caption || '').trim();
  const command = text.charAt(0) === '/' ? text.split(/\s+/)[0].split('@')[0].toLowerCase() : null;

  if (command === '/setup') {
    if (isPrivate) sendText_(chatId, null, 'Send /setup inside your group, after enabling Topics and making me an admin.');
    else setupGroup_(msg);
    return;
  }

  if (!isPrivate && chatId !== prop_('GROUP_CHAT_ID')) return;

  const threadId = !isPrivate && msg.is_topic_message ? msg.message_thread_id : null;
  const ctx = { chatId: chatId, threadId: threadId, topic: isPrivate ? 'General' : topicForThread_(threadId) };

  try {
    if (command && handleCommand_(command, ctx)) return;
    sendTyping_(chatId, threadId);
    const reply = respond_(msg, ctx, text);
    if (reply) sendText_(chatId, threadId, reply);
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    sendText_(chatId, threadId, 'Something went wrong: ' + (err && err.message ? err.message : err));
  }
}

function topicForThread_(threadId) {
  if (!threadId) return 'General';
  for (let i = 0; i < CREATED_TOPICS.length; i++) {
    if (prop_('TOPIC_ID_' + CREATED_TOPICS[i]) === String(threadId)) return CREATED_TOPICS[i];
  }
  return 'General';
}

function handleCommand_(command, ctx) {
  switch (command) {
    case '/new':
      clearHistory_(ctx.topic);
      sendText_(ctx.chatId, ctx.threadId, 'Started a new conversation in ' + ctx.topic + '. Saved memory and notes are kept.');
      return true;
    case '/memory':
      sendText_(ctx.chatId, ctx.threadId, 'Shared memory:\n' + memoryText_());
      return true;
    case '/notes':
      sendText_(ctx.chatId, ctx.threadId, (TOPIC_DOCS[ctx.topic] || TOPIC_DOCS.General) + ': ' + topicDocUrl_(ctx.topic));
      return true;
    case '/briefing':
      sendBriefing_();
      return true;
    case '/help':
    case '/start':
      sendText_(
        ctx.chatId,
        ctx.threadId,
        [
          'Write or send a voice message with anything you need: events, tasks, reminders, notes, questions.',
          '',
          '/new - start a fresh conversation in this topic',
          '/memory - show what I remember',
          '/notes - link to this topic\'s notes document',
          '/briefing - send the morning briefing now',
        ].join('\n')
      );
      return true;
    default:
      return false;
  }
}

/** Turns a Telegram message into Claude content blocks and runs the agent. */
function respond_(msg, ctx, text) {
  const blocks = [];
  let rawText = text;
  let historyText = text;
  let isVoice = false;
  let echo = '';

  const audio = msg.voice || msg.audio;
  if (audio) {
    const transcript = transcribe_(downloadTelegramFile_(audio.file_id), audio.mime_type || 'audio/ogg');
    if (transcript === '[no speech]') return 'I could not hear any speech in that recording.';
    isVoice = true;
    rawText = transcript;
    historyText = '(voice) ' + transcript;
    echo = 'Heard: "' + transcript + '"\n\n';
  } else if (msg.photo && msg.photo.length) {
    const photo = msg.photo[msg.photo.length - 1]; // Largest size.
    const blob = downloadTelegramFile_(photo.file_id);
    blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Utilities.base64Encode(blob.getBytes()) } });
    historyText = '(sent a photo) ' + text;
  } else if (msg.document) {
    const mime = msg.document.mime_type || '';
    if (mime === 'application/pdf' || /^image\/(jpeg|png|gif|webp)$/.test(mime)) {
      const blob = downloadTelegramFile_(msg.document.file_id);
      const data = Utilities.base64Encode(blob.getBytes());
      blocks.push(
        mime === 'application/pdf'
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: data } }
          : { type: 'image', source: { type: 'base64', media_type: mime, data: data } }
      );
      historyText = '(sent a file: ' + (msg.document.file_name || mime) + ') ' + text;
    } else {
      return 'I can read photos, images, and PDFs. This file type (' + (mime || 'unknown') + ') is not supported yet.';
    }
  }

  if (msg.forward_origin) historyText = '(forwarded) ' + historyText;

  const userText = rawText || (blocks.length ? 'The owner sent this without a caption. Work out what they most likely want.' : '');
  if (!userText && !blocks.length) return null; // Stickers and other unsupported messages.
  blocks.push({ type: 'text', text: (msg.forward_origin ? '(Forwarded message)\n' : '') + userText });

  const reply = runAgent_(ctx, blocks, historyText, rawText, isVoice);
  return echo + reply;
}
