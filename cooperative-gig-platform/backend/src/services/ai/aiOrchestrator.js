/**
 * aiOrchestrator.js
 *
 * Routes each worker request to the primary AI provider and — ONLY when that
 * provider fails (network error, rate limit, quota, timeout, API error) — on
 * to the next configured fallback provider. Providers are never all called
 * for the same request; fallback happens strictly on failure.
 *
 * It also owns the tool-calling loop that powers the ShramikSetu data
 * intelligence. The providers themselves (see aiAdapters.js) are independent
 * of MongoDB / worker / job / demand data.
 */

const env = require('../../config/env');
const { toolDeclarations, toolHandlers } = require('./geminiDataTools');
const { createGeminiAdapter, createOpenAICompatibleAdapter } = require('./aiAdapters');

const MAX_TOOL_ROUNDS = 4;

function buildProviderRegistry() {
  return {
    gemini: () => createGeminiAdapter({ apiKey: env.geminiApiKey, model: env.geminiModel || 'gemini-3.6-flash' }),
    groq: () => createOpenAICompatibleAdapter({ name: 'groq', apiKey: env.groqApiKey, model: env.groqModel || 'openai/gpt-oss-20b', baseUrl: 'https://api.groq.com/openai/v1' }),
    xai: () => createOpenAICompatibleAdapter({ name: 'xai', apiKey: env.xaiApiKey, model: env.xaiModel || 'grok-2-latest', baseUrl: 'https://api.x.ai/v1' }),
  };
}

/*
 * Provider order: primary first, then each fallback in configured order,
 * de-duplicated. Reproducible per call so env changes take effect without
 * a server restart. Only providers present in the registry are supported.
 */
function providerOrder() {
  const primary = (env.aiPrimaryProvider || 'gemini').toLowerCase().trim();
  const fallbacks = Array.isArray(env.aiFallbackProviders) && env.aiFallbackProviders.length
    ? env.aiFallbackProviders
    : ['groq', 'xai'];
  const registry = buildProviderRegistry();
  return [...new Set([primary, ...fallbacks])].filter((name) => registry[name]);
}

function availableAdapters() {
  const registry = buildProviderRegistry();
  const adapters = [];
  for (const name of providerOrder()) {
    const factory = registry[name];
    if (!factory) continue;
    const adapter = factory();
    if (adapter.isConfigured()) adapters.push(adapter);
  }
  return adapters;
}

async function executeToolCall(toolCall, workerId) {
  const { name, args } = toolCall;
  const handler = toolHandlers[name];
  if (!handler) {
    return { name, response: { error: `Unknown tool: ${name}` } };
  }
  try {
    const result = await handler(args || {}, workerId);
    return { name, response: result };
  } catch (err) {
    console.error(`[AI Assistant] Tool ${name} failed:`, err.message);
    return { name, response: { error: `Failed to retrieve ${name} data` } };
  }
}

/*
 * Run the full tool-calling loop against a single provider.
 */
async function runWithProvider(adapter, { systemPrompt, history, message, workerId }) {
  const dataUsed = [];
  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await adapter.send({ messages, systemPrompt, tools: toolDeclarations });

    if (!res.toolCalls || res.toolCalls.length === 0) {
      const text = (res.content || '').trim();
      if (!text) {
        return { reply: 'I\'m not sure how to respond to that. Could you rephrase?', dataUsed };
      }
      return { reply: text, dataUsed };
    }

    messages.push({ role: 'assistant', content: res.content || null, toolCalls: res.toolCalls });

    for (const tc of res.toolCalls) {
      dataUsed.push(tc.name);
      const executed = await executeToolCall(tc, workerId);
      messages.push({ role: 'tool', toolCallId: tc.id, name: executed.name, response: executed.response });
    }
  }

  return {
    reply: 'I processed your request but could not generate a complete answer. Please try again.',
    dataUsed,
  };
}

/*
 * Public entry: tries providers in order, moving to the next ONLY on failure.
 * Throws errors with codes the caller can map to friendly messages:
 *   err.code === 'NO_PROVIDER'           -> no provider has an API key configured
 *   err.code === 'ALL_PROVIDERS_FAILED'  -> every configured provider failed;
 *                                            err.kind holds the last failure kind
 */
async function chatWithFallback({ systemPrompt, history, message, workerId }) {
  const adapters = availableAdapters();

  if (adapters.length === 0) {
    const err = new Error('No AI provider is configured with an API key');
    err.code = 'NO_PROVIDER';
    throw err;
  }

  let lastKind = 'HTTP';
  for (const adapter of adapters) {
    try {
      return await runWithProvider(adapter, { systemPrompt, history, message, workerId });
    } catch (err) {
      lastKind = err?.kind || lastKind;
      console.error(`[AI Assistant] Provider "${adapter.name}" failed (${lastKind}):`, err.message);
      // Failure → continue to the next configured provider only.
    }
  }

  const failed = new Error(`All AI providers failed (last: ${lastKind})`);
  failed.code = 'ALL_PROVIDERS_FAILED';
  failed.kind = lastKind;
  throw failed;
}

module.exports = { chatWithFallback, MAX_TOOL_ROUNDS };