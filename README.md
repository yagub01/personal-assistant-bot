# Personal Assistant Bot

A personal Telegram assistant that runs free on Google Apps Script. You write or send voice messages in a private Telegram group, and Claude manages your calendar, tasks, reminders, notes, and Drive.

## What it does

- **Input:** text, voice messages (transcribed by Gemini), photos, and PDFs.
- **Calendar:** reads the calendars checked in Google Calendar, including a subscribed Outlook (Harvard) calendar; creates, moves, and deletes events in Google Calendar, one occurrence at a time for recurring events.
- **Tasks:** Google Tasks (which also shows in Keep).
- **Reminders:** Telegram messages at a set time, posted in the Reminders topic. Reminders can repeat daily, weekly on chosen days, or monthly. If Telegram is briefly unavailable, the bot keeps retrying for about 30 minutes.
- **Event alerts:** a message about 15 minutes before each timed event.
- **Morning briefing** (07:30) and **journal prompt** (23:00) in the Briefing topic. Journal entries are saved verbatim to a Google Doc.
- **Memory:** a shared Google Sheet of lasting facts, plus one notes Doc per topic.
- **Drive:** search, read, and create documents.
- **Web search** for current information.

Topics: **Briefing**, **Academics**, **Careers**, **Reminders**, **General**. The bot can do everything from any topic; the topic tells it the likely context. Replying to one of the bot's messages (for example, "move this to 3 pm" on an event alert) gives it that message as context.

Commands: `/new` (fresh conversation in this topic), `/memory`, `/notes`, `/briefing`, `/help`.

## Costs

- Apps Script, Telegram, Google Calendar, Tasks, Drive: free.
- Gemini transcription: free tier. On the free tier, Google may use inputs to improve its products; the paid tier does not.
- Claude: billed per use. The default model is Claude Opus 5.5 ($4 / $20 per million input / output tokens). A rough estimate is a few cents per message, so about $15 to $45 per month at 10 to 30 messages a day. Set `CLAUDE_MODEL` to `claude-sonnet-5-5` to roughly halve that, or `claude-haiku-5-5` for a much lower cost with less capable answers.

## Setup

### 1. Create the Telegram bot

1. In Telegram, open **@BotFather** and send `/newbot`. Choose a name and a username.
2. Copy the **token** it gives you.

### 2. Get the API keys

- **Claude:** create a key at console.anthropic.com.
- **Gemini:** create a key at aistudio.google.com (Get API key).

### 3. Create the Apps Script project

1. Go to script.google.com and create a **New project**. Name it "Personal Assistant".
2. Open **Project Settings** (gear icon) and tick **Show "appsscript.json" manifest file in editor**.
3. Back in the **Editor**, replace the contents of `appsscript.json` with `src/appsscript.json` from this repository.
4. For each `.gs` file in `src/`, click **+ > Script**, give it the same name (without `.gs`), and paste its contents. Delete the default `Code.gs`.

Alternatively, with Node.js and git on a computer, use clasp from the repository folder. First turn on the Apps Script API at script.google.com/home/usersettings, then run:

```bash
npm install -g @google/clasp
```

```bash
clasp login
```

```bash
clasp create --type standalone --title "Personal Assistant" --rootDir src
```

`clasp create` can replace `src/appsscript.json` with a default manifest that lacks the Tasks service and web app settings. Restore the repository's version before pushing:

```bash
git checkout -- src/appsscript.json
```

```bash
clasp push --force
```

`--force` uploads the manifest without asking for confirmation.

### 4. Add the keys as Script Properties

In **Project Settings > Script Properties**, add:

| Property | Value |
|---|---|
| `TELEGRAM_TOKEN` | Token from BotFather |
| `ANTHROPIC_API_KEY` | Claude key |
| `GEMINI_API_KEY` | Gemini key |

### 5. Run setup

1. In the editor, select the `setup` function and click **Run**.
2. Google asks for permission. Because this is your own script, it shows "Google hasn't verified this app": click **Advanced > Go to Personal Assistant (unsafe)** and allow access.
3. This creates a **Personal Assistant** folder in Drive with the Journal, notes Docs, and the memory Sheet, and starts the one-minute scheduler.
4. Optional: run `testKeys` to confirm the Claude and Gemini keys work.

### 6. Deploy and connect Telegram

1. Click **Deploy > New deployment**, choose type **Web app**, set **Execute as: Me** and **Who has access: Anyone**, then **Deploy**.
2. Copy the **Web app URL** (ends in `/exec`) and save it as the Script Property `WEBAPP_URL`.
3. Run `setWebhook`.

### 7. Register yourself as the owner

1. Open a private chat with your bot in Telegram and send any message.
2. It replies with your Telegram user ID. Save it as the Script Property `OWNER_TELEGRAM_ID`.

From then on, the bot ignores everyone else.

### 8. Create the group and topics

1. In Telegram, create a new group with only you and the bot.
2. In group settings, turn on **Topics**.
3. Make the bot an **administrator** with permission to **manage topics**.
4. Send `/setup` in the group. The bot creates the Briefing, Academics, Careers, and Reminders topics. The built-in General topic is used as General.

### 9. Add the Harvard Outlook calendar (optional)

1. In Outlook on the web: **Settings > Calendar > Shared calendars > Publish a calendar**, choose your calendar and "Can view all details", then **Publish** and copy the **ICS** link.
2. In Google Calendar on a computer: **Other calendars > + > From URL**, paste the link.

Google refreshes subscribed calendars every few hours, so recent Outlook changes can lag. Harvard may disable calendar publishing; if the option is missing, this step is not available.

## Changing code later

After editing the code, use **Deploy > Manage deployments**, edit the existing deployment, choose **New version**, and deploy. This keeps the same URL, so the webhook does not need to be set again.

## Optional settings (Script Properties)

| Property | Default | Meaning |
|---|---|---|
| `CLAUDE_MODEL` | `claude-opus-5-5` | Claude model |
| `CLAUDE_EFFORT` | `medium` | `low`, `medium`, or `high`. Lower is faster and cheaper |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Gemini model used for transcription |
| `BRIEFING_TIME` | `07:30` | Morning briefing time (24-hour) |
| `JOURNAL_TIME` | `23:00` | Journal prompt time (24-hour) |
| `ALERT_MINUTES` | `15` | Minutes before an event to alert |

The time zone is `America/New_York`, set in `appsscript.json`.

## Troubleshooting

- **No reply:** run `checkWebhook` and look at `last_error_message`. Then open **Executions** in the Apps Script sidebar to see errors.
- **Voice fails with a model error:** set `GEMINI_MODEL` to a current Gemini Flash model name.
- **Slow replies:** set `CLAUDE_EFFORT` to `low`.

## Known limitations

- Apps Script stops each run after 6 minutes, so very long requests are cut off.
- The Outlook calendar is read-only and can lag a few hours.
- For recurring events, the bot changes one occurrence at a time. It can rename a whole series or change its location or description, but changing the time of a whole series must be done in Google Calendar.
- Short-term conversation history keeps about the last six exchanges per topic; `/new` clears it. Long-term information is kept in the memory Sheet and notes Docs.
