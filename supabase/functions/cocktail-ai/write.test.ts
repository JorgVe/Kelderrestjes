// Run with:  node --test supabase/functions/cocktail-ai/write.test.ts   (or: deno test supabase/functions/cocktail-ai/)
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildDrafts, type Draft, type Ingredient } from './drinks.ts'
import { checkAddition, cleanReview, DRAFT_TTL_MS, signDraft, toRpcPayload, verifyDraft } from './write.ts'

const SECRET = 'test-secret-not-a-real-key'
const NOW = 1_800_000_000_000

const ing = (id: number, name: string, alcoholic = false): Ingredient => ({ id, name, category: alcoholic ? 'Iets Sterker' : 'Fris', alcoholic, note: null })
const stock = [ing(1, 'Gin', true), ing(2, 'Tonic'), ing(3, 'Limoen'), ing(4, 'Appelsap'), ing(5, 'Bruiswater')]

const draft = (over: Partial<Draft> = {}): Draft => ({
  kind: 'cocktail', name: 'Gin Basil', style: 'Long drink', blurb: 'Fris.', method: 'Roeren.', why: 'Past bij je wens.',
  lines: [
    { amount: '50 ml', ingredient: 'gin', items: [{ id: 1, name: 'Gin' }] },
    { amount: '120 ml', ingredient: 'tonic', items: [{ id: 2, name: 'Tonic' }] },
    { amount: '1 schijf', ingredient: 'limoen', items: [{ id: 3, name: 'Limoen' }] },
  ], ...over,
})
const mock = (): Draft => draft({
  kind: 'mocktail', name: 'Appel Spark',
  lines: [
    { amount: '100 ml', ingredient: 'appelsap', items: [{ id: 4, name: 'Appelsap' }] },
    { amount: '100 ml', ingredient: 'bruiswater', items: [{ id: 5, name: 'Bruiswater' }] },
  ],
})

test('a signed draft comes back exactly as it was, without the explanation for the guest', async () => {
  const token = await signDraft(draft(), SECRET, NOW)
  const raw = await verifyDraft(token, SECRET, NOW + 1000)
  assert.ok(raw)
  assert.equal(raw.kind, 'cocktail')
  assert.equal(raw.name, 'Gin Basil')
  assert.deepEqual(raw.lines[0], { amount: '50 ml', ingredient: 'gin', item_ids: [1] })
  assert.equal('why' in raw, false)
})

test('a token with another secret, a changed body or a changed signature is refused', async () => {
  const token = await signDraft(draft(), SECRET, NOW)
  assert.equal(await verifyDraft(token, 'another-secret', NOW), null)
  const [body, sig] = token.split('.')
  // change one character of the body: the signature no longer fits
  const flipped = (body[10] === 'A' ? 'B' : 'A')
  assert.equal(await verifyDraft(`${body.slice(0, 10)}${flipped}${body.slice(11)}.${sig}`, SECRET, NOW), null)
  assert.equal(await verifyDraft(`${body}.${sig.slice(0, -2)}AA`, SECRET, NOW), null)
})

test('a guest cannot make a draft of their own: unsigned, hand-made, empty or odd tokens never verify', async () => {
  const handMade = btoa(JSON.stringify({ v: 1, exp: NOW + 1e9, d: { kind: 'cocktail', name: 'Gratis', style: 'x', lines: [] } }))
  for (const t of [handMade, `${handMade}.${handMade}`, '', '.', 'a.b.c', 42, null, undefined, {}, 'x'.repeat(20000)]) {
    assert.equal(await verifyDraft(t, SECRET, NOW), null, String(t).slice(0, 30))
  }
})

test('a token expires after two hours', async () => {
  const token = await signDraft(draft(), SECRET, NOW)
  assert.ok(await verifyDraft(token, SECRET, NOW + DRAFT_TTL_MS - 1))
  assert.equal(await verifyDraft(token, SECRET, NOW + DRAFT_TTL_MS + 1), null)
})

test('a draft that is still fine can be added; the checked draft is what gets written', () => {
  const raw = { kind: 'cocktail' as const, name: 'Gin Basil', style: 'Long drink', blurb: 'Fris.', method: 'Roeren.', lines: toRaw(draft()) }
  const res = checkAddition(raw, stock, [], ['cocktail', 'mocktail'])
  assert.equal(res.ok, true)
  if (res.ok) {
    assert.deepEqual(toRpcPayload(res.draft).lines[0], { amount: '50 ml', ingredient: 'gin', items: [1] })
    assert.equal(toRpcPayload(res.draft).kind, 'cocktail')
  }
})
function toRaw(d: Draft) { return d.lines.map((l) => ({ amount: l.amount, ingredient: l.ingredient, item_ids: l.items.map((i) => i.id) })) }

test('the name is taken: exists (per kind, ignoring case and accents)', () => {
  const raw = { kind: 'cocktail' as const, name: 'gîn basil', style: 'x', blurb: null, method: null, lines: toRaw(draft()) }
  assert.deepEqual(checkAddition(raw, stock, [{ kind: 'cocktail', name: 'Gin Basil' }], ['cocktail']), { ok: false, code: 'exists' })
  // the same name as a mocktail is a different recipe
  assert.equal(checkAddition({ ...raw, name: 'Gin Basil' }, stock, [{ kind: 'mocktail', name: 'Gin Basil' }], ['cocktail']).ok, true)
})

test('an ingredient ran out in the meantime: stale; nothing is written for a draft that cannot be made', () => {
  const raw = { kind: 'cocktail' as const, name: 'Gin Basil', style: 'x', blurb: null, method: null, lines: toRaw(draft()) }
  const without = stock.filter((i) => i.id !== 2 && i.id !== 3)                     // no tonic and no lime: fewer than two linked lines remain
  assert.deepEqual(checkAddition(raw, without, [], ['cocktail']), { ok: false, code: 'stale' })
})

test('a mocktail must stay without alcohol, also when it is added', () => {
  const ok = { kind: 'mocktail' as const, name: 'Appel Spark', style: 'x', blurb: null, method: null, lines: toRaw(mock()) }
  assert.equal(checkAddition(ok, stock, [], ['mocktail']).ok, true)
  // an item that is alcoholic now (the category changed) makes the same draft stale
  const alcoholicNow = stock.map((i) => (i.id === 4 ? { ...i, alcoholic: true } : i))
  assert.deepEqual(checkAddition(ok, alcoholicNow, [], ['mocktail']), { ok: false, code: 'stale' })
  // a cocktail without alcohol is not a cocktail
  const dry = { kind: 'cocktail' as const, name: 'Droog', style: 'x', blurb: null, method: null, lines: toRaw(mock()) }
  assert.deepEqual(checkAddition(dry, stock, [], ['cocktail']), { ok: false, code: 'stale' })
})

test('a list the admin switched off for visitors cannot get new recipes from a guest', () => {
  const raw = { kind: 'mocktail' as const, name: 'Appel Spark', style: 'x', blurb: null, method: null, lines: toRaw(mock()) }
  assert.deepEqual(checkAddition(raw, stock, [], ['cocktail']), { ok: false, code: 'disabled' })
})

test('a link anywhere in the text is refused, so a prompt-injected recipe cannot advertise on the menu', () => {
  const base = { kind: 'cocktail' as const, name: 'Gin Basil', style: 'Long drink', blurb: null as string | null, method: null as string | null, lines: toRaw(draft()) }
  for (const patch of [{ name: 'Bezoek spam.com' }, { blurb: 'Zie http://spam.example' }, { method: 'Ga naar www.spam.nl' }, { style: 'x.ru' }]) {
    assert.deepEqual(checkAddition({ ...base, ...patch }, stock, [], ['cocktail']), { ok: false, code: 'refused' }, JSON.stringify(patch))
  }
  const withLink = { ...base, lines: [{ amount: '50 ml', ingredient: 'gin van spam.com', item_ids: [1] }, ...base.lines.slice(1)] }
  assert.deepEqual(checkAddition(withLink, stock, [], ['cocktail']), { ok: false, code: 'refused' })
  assert.equal(checkAddition({ ...base, blurb: 'Fris, met 2 schijfjes limoen. Kost € 4,50.' }, stock, [], ['cocktail']).ok, true)
})

test('the draft in a token goes through the same checks as a fresh one', async () => {
  const token = await signDraft(mock(), SECRET, NOW)
  const raw = await verifyDraft(token, SECRET, NOW)
  assert.ok(raw)
  const fresh = buildDrafts({ drafts: [{ ...raw, why: '' }] }, 'mocktail', stock, [], { max: 1 })
  assert.equal(fresh.drafts.length, 1)
  assert.equal(checkAddition(raw, stock, [], ['mocktail']).ok, true)
})

test('reviews: 1 to 5 stars is required, the text and the name are optional', () => {
  assert.deepEqual(cleanReview({ rating: 5 }), { ok: true, review: { rating: 5, name: null, body: null } })
  assert.deepEqual(cleanReview({ rating: 3, name: '  Jorg ', text: ' Lekker   fris ' }), { ok: true, review: { rating: 3, name: 'Jorg', body: 'Lekker fris' } })
  for (const rating of [0, 6, 2.5, -1, '4', null, undefined, NaN, Infinity]) assert.deepEqual(cleanReview({ rating }), { ok: false, code: 'rating' }, String(rating))
})

test('reviews: angle brackets and control characters are removed, long text is cut', () => {
  const r = cleanReview({ rating: 4, name: '<b>Piet</b>\u0007', text: 'x'.repeat(900) })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.review.name, 'b Piet /b')
    assert.equal(r.review.body?.length, 500)
  }
  assert.equal(cleanReview({ rating: 4, name: 'a'.repeat(100) }).ok && (cleanReview({ rating: 4, name: 'a'.repeat(100) }) as { review: { name: string } }).review.name.length, 40)
})

test('reviews: links are refused, in the text and in the name', () => {
  for (const bad of ['kijk op http://spam.example', 'www.spam.nl', 'bezoek spam.com nu', 'go to Spam.RU']) {
    assert.deepEqual(cleanReview({ rating: 5, text: bad }), { ok: false, code: 'links' }, bad)
    assert.deepEqual(cleanReview({ rating: 5, name: bad }), { ok: false, code: 'links' }, bad)
  }
  assert.equal(cleanReview({ rating: 5, text: 'Heerlijk, met 2 limoenen. Kost € 4,50.' }).ok, true)
})
