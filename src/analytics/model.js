// Google Analytics events: only the action and a few short labels go out — never amounts, names, emails or ids.

/** Event parameters that may leave the browser, and the values each accepts. */
const ALLOWED = {
    account_type: ['personal', 'business'],
    mode: ['empty', 'copy'],
    kind: ['analytics', 'growth'],
    provider: ['gemini', 'openai', 'anthropic', 'groq', 'openrouter', 'custom'],
};

/** Keeps only known parameters with known values; anything else (a sum, a name, a typo) is dropped. */
export function safeParams(params = {}) {
    const out = {};
    for (const [key, value] of Object.entries(params || {})) {
        if (ALLOWED[key]?.includes(value)) out[key] = value;
    }
    return out;
}
