require('dotenv').config();

const parseList = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

module.exports = {
  port: process.env.PORT || 5001,
  mongoURI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cooperative_gig_platform',
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientURL: process.env.CLIENT_URL || 'http://localhost:5173',
  osrmBaseUrl: process.env.OSRM_BASE_URL || 'https://router.project-osrm.org',
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || 'onboarding@resend.dev',

  // ── AI Assistant providers ──────────────────────────────────────────
  // Provider API keys (added by the administrator; never hardcoded).
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  groqApiKey: process.env.GROQ_API_KEY || '',
  xaiApiKey: process.env.XAI_API_KEY || '',
  // Primary provider + ordered fallbacks. Supported: gemini, groq, xai.
  aiPrimaryProvider: process.env.AI_PRIMARY_PROVIDER || 'gemini',
  aiFallbackProviders: parseList(process.env.AI_FALLBACK_PROVIDERS || 'groq,xai'),
  // Optional per-provider model overrides.
  geminiModel: process.env.GEMINI_MODEL || '',
  groqModel: process.env.GROQ_MODEL || '',
  xaiModel: process.env.XAI_MODEL || '',
};
