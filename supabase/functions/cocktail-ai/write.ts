// Pure logic of the two actions of cocktail-ai that write to the database (no Deno or network imports, so it runs under `node --test`).
//
//   add     a guest puts a recipe that Claude just invented for them on the menu. The website never sends the recipe itself, only the
//           signed token that came with the draft: the function checks the signature, so a guest cannot add anything Claude did not
//           write, and cannot change a field. The draft is checked once more against the ingredients in stock (and its kind: no
//           alcohol in a mocktail) right before it is written.
//   review  a guest leaves a rating (1 to 5 stars) with an optional text and name.
//
// Nothing here talks to the database; index.ts does that, with the service role, after these checks.
import { buildDrafts, fold, type Draft, type Ingredient, type Kind } from './drinks.ts'

export const DRAFT_TTL_MS = 2 * 60 * 60 * 1000          // a suggestion can be put on the menu for two hours
export const MAX_REVIEW_NAME = 40
export const MAX_REVIEW_TEXT = 500

const KINDS: Kind[] = ['cocktail', 'mocktail']
// Links are not wanted in a review or a recipe: they are what spam is made of.
const LINK = /(https?:|www\.|[a-z0-9-]+\.(com|net|org|nl|io|ru|cn|xyz|top|info|biz|co|shop|site|online)\b)/i
const enc = new TextEncoder()
const dec = new TextDecoder()
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function fromB64(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(t + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0))
}
// The signing key is made from a secret the function already has, plus a label: the signature says nothing about the secret itself.
const hmacKey = (secret: string) =>
  crypto.subtle.importKey('raw', enc.encode(`${secret}:kelderrestjes-draft-v1`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])

// What a token carries: the fields that end up in the database (not `why`, which is only an explanation for the guest).
export type RawDraft = {
  kind: Kind; name: string; style: string; blurb: string | null; method: string | null
  lines: { amount: string; ingredient: string; item_ids: number[] }[]
}

export async function signDraft(draft: Draft, secret: string, now = Date.now()): Promise<string> {
  const raw: RawDraft = {
    kind: draft.kind, name: draft.name, style: draft.style, blurb: draft.blurb, method: draft.method,
    lines: draft.lines.map((l) => ({ amount: l.amount, ingredient: l.ingredient, item_ids: l.items.map((i) => i.id) })),
  }
  const body = toB64(enc.encode(JSON.stringify({ v: 1, exp: now + DRAFT_TTL_MS, d: raw })))
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)))
  return `${body}.${toB64(sig)}`
}

// The draft inside a token, or null: not ours (bad signature), expired, or not shaped like a draft.
export async function verifyDraft(token: unknown, secret: string, now = Date.now()): Promise<RawDraft | null> {
  if (typeof token !== 'string' || token.length > 16000) return null
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  try {
    if (!(await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64(parts[1]), enc.encode(parts[0])))) return null
    const payload = JSON.parse(dec.decode(fromB64(parts[0])))
    if (!isObject(payload) || payload.v !== 1 || typeof payload.exp !== 'number' || payload.exp < now) return null
    const d = payload.d
    if (!isObject(d) || !KINDS.includes(d.kind as Kind) || typeof d.name !== 'string' || typeof d.style !== 'string' || !Array.isArray(d.lines)) return null
    const lines = d.lines.map((l) => (isObject(l) && typeof l.ingredient === 'string' && Array.isArray(l.item_ids)
      ? { amount: typeof l.amount === 'string' ? l.amount : '', ingredient: l.ingredient, item_ids: l.item_ids.filter((x): x is number => typeof x === 'number') }
      : null))
    if (lines.some((l) => !l)) return null
    return {
      kind: d.kind as Kind, name: d.name, style: d.style,
      blurb: typeof d.blurb === 'string' ? d.blurb : null, method: typeof d.method === 'string' ? d.method : null,
      lines: lines as RawDraft['lines'],
    }
  } catch {
    return null
  }
}

export type Addition = { ok: true; draft: Draft } | { ok: false; code: 'disabled' | 'exists' | 'stale' | 'refused' }

// Is this draft still fine to put on the menu, right now?
//   disabled  the admin switched that list off for visitors (kinds does not contain the kind)
//   exists    a recipe of that kind already has the name (someone was quicker, or it was added before)
//   stale     the stock changed (an ingredient ran out) or the draft does not hold up any more: the same checks as for a new draft,
//             including "no alcohol in a mocktail"
//   refused   the text holds a link. A guest's wish is read by Claude, and a guest could try to make Claude write a link into the name or the
//             method; a recipe is published for everyone with one click, so a link never gets through.
export function checkAddition(raw: RawDraft, ingredients: Ingredient[], existing: { kind: string; name: string }[], kinds: Kind[]): Addition {
  if (!kinds.includes(raw.kind)) return { ok: false, code: 'disabled' }
  const texts = [raw.name, raw.style, raw.blurb, raw.method, ...raw.lines.flatMap((l) => [l.amount, l.ingredient])]
  if (texts.some((t) => typeof t === 'string' && LINK.test(t))) return { ok: false, code: 'refused' }
  const name = fold(raw.name).trim()
  if (existing.some((e) => e.kind === raw.kind && fold(e.name).trim() === name)) return { ok: false, code: 'exists' }
  const checked = buildDrafts({ drafts: [{ ...raw }] }, raw.kind, ingredients, existing, { max: 1, kinds: [raw.kind] })
  const draft = checked.drafts[0]
  return draft ? { ok: true, draft } : { ok: false, code: 'stale' }
}

// The argument of the database function add_guest_recipe (migration 0030).
export function toRpcPayload(d: Draft) {
  return {
    kind: d.kind, name: d.name, style: d.style, blurb: d.blurb, method: d.method,
    lines: d.lines.map((l) => ({ amount: l.amount, ingredient: l.ingredient, items: l.items.map((i) => i.id) })),
  }
}

// ---------------------------------------------------------------- reviews

export type Review = { rating: number; name: string | null; body: string | null }
export type ReviewCheck = { ok: true; review: Review } | { ok: false; code: 'rating' | 'links' }

// A line a guest typed: control characters and angle brackets go, white space is collapsed, and it is cut to the maximum.
function line(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null
  // deno-lint-ignore no-control-regex
  const t = raw.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim()
  return t.length ? t : null
}

export function cleanReview(raw: Record<string, unknown>): ReviewCheck {
  const rating = raw.rating
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, code: 'rating' }
  const name = line(raw.name, MAX_REVIEW_NAME)
  const body = line(raw.text, MAX_REVIEW_TEXT)
  if ((name && LINK.test(name)) || (body && LINK.test(body))) return { ok: false, code: 'links' }
  return { ok: true, review: { rating, name, body } }
}
