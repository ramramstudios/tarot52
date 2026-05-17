const DEFAULT_MODEL = 'gpt-5-mini';

function setCors(req, res) {
  const origin = req.headers.origin || '';
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowed.length === 0 || allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function compactCard(card) {
  return [
    `${card.positionName}: ${card.name} (${card.tarot})`,
    `Term: ${card.term}`,
    `Position guidance: ${card.positionPrompt}`,
    card.description ? `RWS material: ${card.description}` : '',
  ].filter(Boolean).join('\n');
}

function buildInput(payload) {
  const cards = Array.isArray(payload.cards) ? payload.cards : [];
  const followUps = Array.isArray(payload.followUps) ? payload.followUps : [];

  return [
    `Querent inquiry:\n${payload.userPrompt || ''}`,
    '',
    `Reading mode: ${payload.mode?.label || 'General Insight'}`,
    '',
    'Cards drawn in order:',
    cards.map(compactCard).join('\n\n'),
    '',
    followUps.length
      ? `Follow-up context:\n${followUps.map((item) => `${item.role}: ${item.content}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n');
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    sendJson(res, 500, { error: 'OPENAI_API_KEY is not configured' });
    return;
  }

  const payload = req.body || {};
  if (!payload.userPrompt || !Array.isArray(payload.cards) || payload.cards.length === 0) {
    sendJson(res, 400, { error: 'Missing userPrompt or cards' });
    return;
  }

  const instructions = [
    payload.systemPrompt || '',
    'You are Tarot 52, a reflective tarot reading assistant.',
    'Use the cards as symbolic prompts, not as fixed predictions.',
    'Be warm, specific, and grounded. Avoid claiming certainty about the future.',
    'Structure the answer around each card position, then give a concise synthesis and one useful reflection question.',
  ].filter(Boolean).join('\n\n');

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        instructions,
        input: buildInput(payload),
        max_output_tokens: 900,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      sendJson(res, response.status, {
        error: data.error?.message || 'OpenAI request failed',
      });
      return;
    }

    sendJson(res, 200, {
      text: data.output_text || '',
      model: data.model,
      responseId: data.id,
    });
  } catch (err) {
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : 'Unexpected server error',
    });
  }
};
