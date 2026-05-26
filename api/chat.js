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
    `${card.positionName}: ${card.name}`,
    `Term: ${card.term}`,
    `Position guidance: ${card.positionPrompt}`,
    card.description ? `Background symbolism (do not surface this in your response — use it only to inform interpretation): ${card.description}` : '',
  ].filter(Boolean).join('\n');
}

function compactKnowledgeDocument(doc) {
  return [
    `Title: ${doc.title || doc.path || 'Untitled knowledge document'}`,
    doc.path ? `Path: ${doc.path}` : '',
    doc.content || '',
  ].filter(Boolean).join('\n');
}

function compactAstrologyProfile(profile) {
  if (!profile || typeof profile !== 'object') return '';
  const lines = ['sun', 'moon', 'rising']
    .filter((key) => typeof profile[key] === 'string' && profile[key].trim())
    .map((key) => `${key}: ${profile[key].trim()}`);
  return lines.join('\n');
}

function compactAstrologyContext(context) {
  const placements = context && typeof context === 'object' ? context.placements : null;
  if (!placements || typeof placements !== 'object') return '';

  return ['sun', 'moon', 'rising'].map((slot) => {
    const placement = placements[slot];
    if (!placement || typeof placement !== 'object') return '';

    const elementContext = placement.elementContext && typeof placement.elementContext === 'object'
      ? placement.elementContext
      : {};
    return [
      `${slot}: ${placement.sign || ''}`,
      placement.element ? `${slot} element: ${placement.element}` : '',
      placement.meaning ? `${slot} meaning: ${placement.meaning}` : '',
      Array.isArray(elementContext.traits) && elementContext.traits.length
        ? `${placement.element || 'Element'} traits: ${elementContext.traits.join(', ')}`
        : '',
      elementContext.relationships ? `${placement.element || 'Element'} relationship style: ${elementContext.relationships}` : '',
      Array.isArray(elementContext.values) && elementContext.values.length
        ? `${placement.element || 'Element'} values: ${elementContext.values.join(', ')}`
        : '',
      elementContext.selfCare ? `${placement.element || 'Element'} self-care: ${elementContext.selfCare}` : '',
    ].filter(Boolean).join('\n');
  }).filter(Boolean).join('\n\n');
}

function buildInput(payload) {
  const cards = Array.isArray(payload.cards) ? payload.cards : [];
  const followUps = Array.isArray(payload.followUps) ? payload.followUps : [];
  const knowledgeBase = Array.isArray(payload.knowledgeBase) ? payload.knowledgeBase : [];
  const astrologyProfile = compactAstrologyContext(payload.astrologyContext)
    || compactAstrologyProfile(payload.astrologyProfile);
  const phase = payload.phase === 'followup' ? 'follow-up' : 'initial reading';

  return [
    `Conversation phase: ${phase}`,
    '',
    `Querent inquiry:\n${payload.userPrompt || ''}`,
    '',
    `Reading mode: ${payload.mode?.label || 'General Insight'}`,
    '',
    'Cards drawn in order:',
    cards.map(compactCard).join('\n\n'),
    '',
    astrologyProfile
      ? `Querent's birth chart (use as additional interpretive context, not as the primary lens):\n${astrologyProfile}`
      : '',
    '',
    knowledgeBase.length
      ? `Knowledge base context (use silently to enrich the reading; do not quote or cite unless asked):\n${knowledgeBase.map(compactKnowledgeDocument).join('\n\n---\n\n')}`
      : '',
    '',
    payload.initialReading
      ? `Initial assistant reading already delivered:\n${payload.initialReading}`
      : '',
    '',
    followUps.length
      ? `Conversation since the initial reading:\n${followUps.map((item) => `${item.role}: ${item.content}`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n');
}

function buildInstructions(payload) {
  // The frontend owns voice, format, and structure via payload.systemPrompt.
  // The API only adds a minimal fallback identity for the rare case where the
  // frontend forgot to send one. Do NOT add tone/format rules here.
  return payload.systemPrompt
    ? payload.systemPrompt
    : [
      'You are Tarot 52, a reflective tarot reading assistant. Use the cards as symbolic prompts, not as fixed predictions.',
      'Respond how the question needs. Some answers land in one sentence. Some need multiple paragraphs. Vary sentence length and response length. Lead with the useful insight, avoid hollow preambles and filler phrases. Write like a person with care and specificity. Do not use markdown unless asked.',
    ].join(' ');
}

function shouldDebugEcho(request, payload) {
  const url = new URL(request.url, 'http://localhost');
  return url.searchParams.get('debug') === '1'
    || payload._debug === true
    || process.env.TAROT52_DEBUG === '1';
}

function summarizePayload(payload) {
  const cards = Array.isArray(payload.cards) ? payload.cards : [];
  const knowledgeBase = Array.isArray(payload.knowledgeBase) ? payload.knowledgeBase : [];
  const followUps = Array.isArray(payload.followUps) ? payload.followUps : [];
  const astrologyProfile = compactAstrologyContext(payload.astrologyContext)
    || compactAstrologyProfile(payload.astrologyProfile);

  return {
    phase: payload.phase || 'initial',
    mode: payload.mode,
    cardCount: cards.length,
    knowledgeDocCount: knowledgeBase.length,
    followUpCount: followUps.length,
    hasAstrologyProfile: Boolean(astrologyProfile),
    hasAstrologyContext: Boolean(compactAstrologyContext(payload.astrologyContext)),
  };
}

function logRequestSummary(payload, model, instructions, input) {
  const cards = Array.isArray(payload.cards) ? payload.cards : [];
  const knowledgeBase = Array.isArray(payload.knowledgeBase) ? payload.knowledgeBase : [];

  console.log('[tarot52:request]', {
    phase: payload.phase || 'initial',
    model,
    'mode.label': payload.mode?.label || null,
    'cards.length': cards.length,
    cards: cards.map((card) => `${card.name || 'Unknown'}/${card.positionName || 'Unpositioned'}`),
    knowledgeBase: knowledgeBase.map((doc) => doc.title || doc.path || 'Untitled knowledge document'),
    hasAstrologyProfile: Boolean(compactAstrologyProfile(payload.astrologyProfile)),
    hasAstrologyContext: Boolean(compactAstrologyContext(payload.astrologyContext)),
    'userPrompt.length': String(payload.userPrompt || '').length,
    'instructions.length': instructions.length,
    'input.length': input.length,
  });
}

function logErrorSummary(status, message, extra = {}) {
  console.log('[tarot52:error]', {
    status,
    message,
    ...extra,
  });
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
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(request, 400, { error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return jsonResponse(request, 400, { error: 'JSON body must be an object' });
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const instructions = buildInstructions(payload);
  const input = buildInput(payload);
  logRequestSummary(payload, model, instructions, input);

  if (shouldDebugEcho(request, payload)) {
    return jsonResponse(request, 200, {
      debug: true,
      model,
      instructions,
      input,
      payloadSummary: summarizePayload(payload),
    });
  }

  if (!payload.userPrompt || !Array.isArray(payload.cards) || payload.cards.length === 0) {
    logErrorSummary(400, 'Missing userPrompt or cards');
    return jsonResponse(request, 400, { error: 'Missing userPrompt or cards' });
  }

  if (!process.env.OPENAI_API_KEY) {
    logErrorSummary(500, 'OPENAI_API_KEY is not configured');
    return jsonResponse(request, 500, { error: 'OPENAI_API_KEY is not configured' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions,
        input,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.error?.message || 'OpenAI request failed';
      logErrorSummary(response.status, message);
      return jsonResponse(request, response.status, {
        error: message,
      });
    }

    const text = extractResponseText(data);
    if (!text) {
      logErrorSummary(502, 'OpenAI returned no text output', {
        model: data.model,
        responseId: data.id,
      });
      return jsonResponse(request, 502, {
        error: 'OpenAI returned no text output',
        model: data.model,
        responseId: data.id,
        outputTypes: Array.isArray(data.output) ? data.output.map((item) => item.type) : [],
      });
    }

    console.log('[tarot52:response]', {
      model: data.model || model,
      responseId: data.id,
      usage: data.usage || null,
      'text.length': text.length,
    });

    return jsonResponse(request, 200, {
      text,
      model: data.model,
      responseId: data.id,
    });
  } catch (err) {
    logErrorSummary(500, err instanceof Error ? err.message : 'Unexpected server error');
    return jsonResponse(request, 500, {
      error: err instanceof Error ? err.message : 'Unexpected server error',
    });
  }
}
