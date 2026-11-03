/**
 * Telegram Bot API helpers.
 */

function tg_(method, payload) {
  const url = 'https://api.telegram.org/bot' + requireProp_('TELEGRAM_TOKEN') + '/' + method;
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload || {}),
    muteHttpExceptions: true,
  });
  const data = JSON.parse(res.getContentText());
  if (!data.ok) throw new Error('Telegram ' + method + ' failed: ' + data.description);
  return data.result;
}

/** Sends text, splitting it into chunks below Telegram's 4096-character limit. */
function sendText_(chatId, threadId, text) {
  const chunks = splitMessage_(String(text || '').trim() || '(empty response)', 4000);
  chunks.forEach(function (chunk) {
    const payload = {
      chat_id: chatId,
      text: chunk,
      link_preview_options: { is_disabled: true },
    };
    if (threadId) payload.message_thread_id = Number(threadId);
    tg_('sendMessage', payload);
  });
}

function splitMessage_(text, limit) {
  const chunks = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(' ', limit);
    if (cut < limit / 2) cut = limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, '');
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/** Sends a message to a named topic in the configured group. */
function sendToTopic_(topic, text) {
  const chatId = requireProp_('GROUP_CHAT_ID');
  const threadId = topic === 'General' ? null : prop_('TOPIC_ID_' + topic);
  sendText_(chatId, threadId, text);
}

function sendTyping_(chatId, threadId) {
  try {
    const payload = { chat_id: chatId, action: 'typing' };
    if (threadId) payload.message_thread_id = Number(threadId);
    tg_('sendChatAction', payload);
  } catch (err) {
    console.warn('sendChatAction failed: ' + err);
  }
}

/** Downloads a file sent to the bot (voice note, photo, document) as a Blob. */
function downloadTelegramFile_(fileId) {
  const file = tg_('getFile', { file_id: fileId });
  const url = 'https://api.telegram.org/file/bot' + requireProp_('TELEGRAM_TOKEN') + '/' + file.file_path;
  return UrlFetchApp.fetch(url).getBlob();
}
