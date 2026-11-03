/**
 * Voice transcription through the Gemini API.
 */

function transcribe_(blob, mimeType) {
  const model = prop_('GEMINI_MODEL');
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              'Transcribe this voice message word for word, in the language spoken. ' +
              'Output only the transcript: no commentary, labels, or timestamps. ' +
              'If there is no speech, output [no speech].',
          },
          { inline_data: { mime_type: mimeType || 'audio/ogg', data: Utilities.base64Encode(blob.getBytes()) } },
        ],
      },
    ],
  };
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': requireProp_('GEMINI_API_KEY') },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code !== 200) {
    throw new Error('Transcription failed (Gemini HTTP ' + code + '): ' + truncate_(text, 500));
  }
  const data = JSON.parse(text);
  const parts =
    data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
  const transcript = (parts || [])
    .map(function (p) {
      return p.text || '';
    })
    .join('')
    .trim();
  if (!transcript) throw new Error('Transcription returned no text.');
  return transcript;
}
