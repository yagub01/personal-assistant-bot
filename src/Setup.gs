/**
 * One-time setup. Run these from the Apps Script editor (select the function, then Run):
 *   1. setup()        creates the Drive folder, notes docs, memory sheet, and the minute trigger
 *   2. setWebhook()   connects Telegram to this script (after deploying the web app)
 *   3. checkWebhook() shows Telegram's delivery status, for troubleshooting
 * Then send /setup inside your Telegram group to create the topics.
 */

function setup() {
  ['TELEGRAM_TOKEN', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY'].forEach(requireProp_);

  if (!prop_('FOLDER_ID')) {
    setProp_('FOLDER_ID', DriveApp.createFolder('Personal Assistant').getId());
  }
  const folder = DriveApp.getFolderById(prop_('FOLDER_ID'));

  ['Journal', 'Academics Notes', 'Careers Notes', 'General Notes'].forEach(function (name) {
    const key = 'DOC_' + name.replace(/\s+/g, '_').toUpperCase();
    if (prop_(key)) return;
    const doc = DocumentApp.create(name);
    doc.getBody().setText(name === 'Journal' ? 'Journal' : name + ' (maintained by the assistant; you can edit this freely)');
    doc.saveAndClose();
    DriveApp.getFileById(doc.getId()).moveTo(folder);
    setProp_(key, doc.getId());
  });

  if (!prop_('MEMORY_SHEET_ID')) {
    const ss = SpreadsheetApp.create('Assistant Memory');
    const sheet = ss.getSheets()[0].setName('Memory');
    sheet.appendRow(['ID', 'Created', 'Category', 'Fact']);
    sheet.setFrozenRows(1);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
    setProp_('MEMORY_SHEET_ID', ss.getId());
  }

  if (!prop_('WEBHOOK_SECRET')) {
    setProp_('WEBHOOK_SECRET', Utilities.getUuid().replace(/-/g, ''));
  }

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(1).create();

  console.log('Setup complete. Drive folder: ' + folder.getUrl());
  console.log('Next: deploy as a web app, save WEBAPP_URL in Script Properties, then run setWebhook().');
}

function setWebhook() {
  const url = requireProp_('WEBAPP_URL') + '?secret=' + requireProp_('WEBHOOK_SECRET');
  tg_('setWebhook', { url: url, allowed_updates: ['message'], drop_pending_updates: true });
  console.log('Webhook set. Message the bot privately to check it responds.');
}

function checkWebhook() {
  const info = tg_('getWebhookInfo', {});
  // Hide the secret in the log.
  info.url = String(info.url || '').replace(/secret=[^&]+/, 'secret=***');
  console.log(JSON.stringify(info, null, 2));
}

/** Sends a short test request to Claude and checks the Gemini model, to confirm both API keys work. */
function testKeys() {
  const res = callClaude_('Reply with one short sentence.', [], [{ role: 'user', content: 'Say hello.' }]);
  console.log('Claude (' + res.model + '): ' + textOf_(res.content));
  const gemini = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + prop_('GEMINI_MODEL'),
    { headers: { 'x-goog-api-key': requireProp_('GEMINI_API_KEY') }, muteHttpExceptions: true }
  );
  console.log('Gemini model check: HTTP ' + gemini.getResponseCode() + ' ' + truncate_(gemini.getContentText(), 300));
}

/** Handles /setup sent in the group: records the group and creates the topics. */
function setupGroup_(msg) {
  const chatId = String(msg.chat.id);
  if (!msg.chat.is_forum) {
    sendText_(chatId, null, 'Please enable Topics in the group settings first, then send /setup again.');
    return;
  }
  if (prop_('GROUP_CHAT_ID') !== chatId) {
    // New or different group: forget topics created elsewhere.
    CREATED_TOPICS.forEach(function (name) {
      PropertiesService.getScriptProperties().deleteProperty('TOPIC_ID_' + name);
    });
    setProp_('GROUP_CHAT_ID', chatId);
  }
  CREATED_TOPICS.forEach(function (name) {
    if (prop_('TOPIC_ID_' + name)) return;
    const topic = tg_('createForumTopic', { chat_id: chatId, name: name });
    setProp_('TOPIC_ID_' + name, topic.message_thread_id);
  });

  sendToTopic_('Briefing', 'Morning briefing at ' + prop_('BRIEFING_TIME') + ' and journal prompt at ' + prop_('JOURNAL_TIME') + '. Reply to the journal prompt here and I will save it verbatim.');
  sendToTopic_('Academics', 'Academics: courses, assignments, exams, and study notes.');
  sendToTopic_('Careers', 'Careers: recruiting, networking contacts, applications, and interviews.');
  sendToTopic_('Reminders', 'Reminders and event alerts will appear here.');
  sendToTopic_('General', 'Setup complete. Write or send a voice message in any topic. Send /help for commands.');
}
