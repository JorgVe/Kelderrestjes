// Module hooks for tests/cocktail-ai-handler.test.mjs: the two `npm:` imports of the Edge Function become small fakes that
// forward to globalThis.__fake, so the real index.ts can run under Node without Deno, Supabase or Claude.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('npm:@supabase/supabase-js')) return { url: 'stub:supabase', shortCircuit: true }
  if (specifier.startsWith('npm:@anthropic-ai/sdk')) return { url: 'stub:anthropic', shortCircuit: true }
  return nextResolve(specifier, context)
}
export async function load(url, context, nextLoad) {
  if (url === 'stub:supabase') {
    return { format: 'module', shortCircuit: true, source: 'export const createClient = (...a) => globalThis.__fake.createClient(...a)' }
  }
  if (url === 'stub:anthropic') {
    return {
      format: 'module', shortCircuit: true,
      source: `class APIError extends Error { constructor(m){ super(m); this.status = 500 } }
class AuthenticationError extends APIError {}
class PermissionDeniedError extends APIError {}
class Anthropic { constructor(o){ this.messages = { create: (a) => globalThis.__fake.claude(a) } } }
Anthropic.APIError = APIError; Anthropic.AuthenticationError = AuthenticationError; Anthropic.PermissionDeniedError = PermissionDeniedError;
export default Anthropic`,
    }
  }
  return nextLoad(url, context)
}
