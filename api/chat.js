const DEFAULT_MODEL = 'gpt-5-mini';

function corsHeaders(request) {
  const origin = request.headers.get('origin') || '';
  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const allowOrigin = allowed.length === 0 || allowed.includes(origin)
    ? origin || '*'
    : 'null';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
  };
}

function jsonResponse(request, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request),
  });
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

function extractResponseText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const parts = [];
  const output = Array.isArray(data.output) ? data.output : [];

  output.forEach((item) => {
    if (typeof item.text === 'string') parts.push(item.text);
    if (typeof item.content === 'string') parts.push(item.content);

    if (Array.isArray(item.content)) {
      item.content.forEach((content) => {
        if (typeof content.text === 'string') parts.push(content.text);
        if (typeof content.content === 'string') parts.push(content.content);
      });
    }
  });

  return parts.join('\n').trim();
}

export async function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export async function GET(request) {
  return jsonResponse(request, 405, { error: 'Method not allowed' });
}

export async function POST(request) {
  if (!process.env.OPENAI_API_KEY) {
    return jsonResponse(request, 500, { error: 'OPENAI_API_KEY is not configured' });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(request, 400, { error: 'Invalid JSON body' });
  }

  if (!payload.userPrompt || !Array.isArray(payload.cards) || payload.cards.length === 0) {
    return jsonResponse(request, 400, { error: 'Missing userPrompt or cards' });
  }

  // The frontend owns voice, format, and structure via payload.systemPrompt.
  // The API only adds a minimal fallback identity for the rare case where the
  // frontend forgot to send one. Do NOT add tone/format rules here.
  const instructions = payload.systemPrompt
    ? payload.systemPrompt
    : 'You are Tarot 52, a reflective tarot reading assistant. Use the cards as symbolic prompts, not as fixed predictions.';

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
      return jsonResponse(request, response.status, {
        error: data.error?.message || 'OpenAI request failed',
      });
    }

    const text = extractResponseText(data);
    if (!text) {
      return jsonResponse(request, 502, {
        error: 'OpenAI returned no text output',
        model: data.model,
        responseId: data.id,
        outputTypes: Array.isArray(data.output) ? data.output.map((item) => item.type) : [],
      });
    }

    return jsonResponse(request, 200, {
      text,
      model: data.model,
      responseId: data.id,
    });
  } catch (err) {
    return jsonResponse(request, 500, {
      error: err instanceof Error ? err.message : 'Unexpected server error',
    });
  }
}
