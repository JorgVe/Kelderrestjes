// Run with:  node --test tests/*.test.mjs
// Runs the real Edge Function supabase/functions/cocktail-ai/index.ts under Node, with a fake database, a fake Claude and no network.
// It checks what visitors can make the function WRITE: the "add" and "review" actions (signed drafts, limits, switches, dry runs), and the
// preset kind and signed drafts of "suggest". Nothing here can reach Supabase or Claude.
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register('./helpers/stub-hooks.mjs', import.meta.url)

// ---- the fake world
const ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'pub-key' }),
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sec-key' }),
  ANTHROPIC_API_KEY: 'test-anthropic',
}
let serve
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { serve = h } }

const item = (id, name, category_id, over = {}) => ({ id, category_id, name, note: null, in_stock: true, in_cocktails: true, zero_proof: false, serving: 'both', ...over })
const baseWorld = () => ({
  settings: [],
  categories: [{ id: 1, label: 'Iets Sterker', alcoholic: true }, { id: 2, label: 'Fris', alcoholic: false }],
  items: [item(1, 'Gin', 1), item(2, 'Tonic', 2), item(3, 'Limoen', 2), item(4, 'Appelsap', 2), item(5, 'Bruiswater', 2)],
  recipes: [{ id: 10, kind: 'cocktail', name: 'Daiquiri', style: 'Sour', blurb: 'Fris.', sort_order: 1, recipe_lines: [] },
            { id: 11, kind: 'mocktail', name: 'Virgin Mojito', style: 'Lang', blurb: 'Fris.', sort_order: 1, recipe_lines: [] }],
  claim: 'ok', claimSuggestion: 'ok', reviewCount: 0, addError: null, reviewInsertError: null,
  claude: null, calls: [], claudeCalls: [],
})
let world = baseWorld()

// A query builder that records what was asked and answers from `world`; awaiting it gives { data, error, count }.
function builder(table, who) {
  const st = { table, who, ops: [], single: false, insert: null }
  const b = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') {
        return (resolve, reject) => Promise.resolve(answer(st)).then(resolve, reject)
      }
      return (...args) => {
        if (prop === 'maybeSingle' || prop === 'single') st.single = true
        if (prop === 'insert') st.insert = args[0]
        st.ops.push([String(prop), ...args])
        return b
      }
    },
  })
  return b
}
function answer(st) {
  world.calls.push({ who: st.who, table: st.table, ops: st.ops, insert: st.insert })
  if (st.table === 'settings') return { data: world.settings, error: null }
  if (st.table === 'items') return { data: world.items, error: null }
  if (st.table === 'categories') return { data: world.categories, error: null }
  if (st.table === 'recipes') {
    const eq = st.ops.find((o) => o[0] === 'eq' && o[1] === 'id')
    if (st.single) return { data: eq ? world.recipes.find((r) => r.id === eq[2]) ?? null : null, error: null }
    return { data: world.recipes, error: null }
  }
  // The service role has no rights on tables in this project: any direct query on `reviews` (or any table, for the service role) is an error.
  if (st.who === 'service') return { data: null, error: { code: '42501', message: 'permission denied for table ' + st.table } }
  if (st.table === 'reviews') throw new Error('visitors never query reviews through the function')
  throw new Error('unexpected table ' + st.table)
}
globalThis.__fake = {
  createClient: (_url, key) => {
    const who = key === 'sec-key' ? 'service' : 'anon'
    return {
      from: (table) => builder(table, who),
      auth: { getUser: async () => ({ data: { user: null }, error: new Error('no session') }) },
      rpc: async (name, args) => {
        world.calls.push({ who, rpc: name, args })
        if (name === 'claim_write') return { data: world.claim, error: null }
        if (name === 'claim_suggestion') return { data: world.claimSuggestion, error: null }
        if (name === 'add_guest_recipe') return world.addError ? { data: null, error: world.addError } : { data: 42, error: null }
        if (name === 'review_exists') return { data: world.reviewCount > 0, error: null }
        if (name === 'add_review') {
          if (world.reviewInsertError) return { data: null, error: world.reviewInsertError }
          return { data: { id: 7, recipe_id: args.p_recipe_id, rating: args.p_rating, name: args.p_name, body: args.p_body, created_at: '2026-11-08T10:00:00Z' }, error: null }
        }
        if (name === 'is_admin') return { data: false, error: null }
        throw new Error('unexpected rpc ' + name)
      },
    }
  },
  claude: async (args) => {
    world.claudeCalls.push(args)
    return { content: [{ type: 'text', text: JSON.stringify(world.claude) }], usage: {}, stop_reason: 'end_turn' }
  },
}

await import('../supabase/functions/cocktail-ai/index.ts')
const { signDraft } = await import('../supabase/functions/cocktail-ai/write.ts')
const SECRET = 'sec-key'

// ---- helpers
const call = async (body, headers = {}) => {
  const res = await serve(new Request('https://example.supabase.co/functions/v1/cocktail-ai', {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7', ...headers }, body: JSON.stringify(body),
  }))
  return { status: res.status, body: await res.json() }
}
const writes = () => world.calls.filter((c) => c.rpc === 'add_guest_recipe' || c.rpc === 'add_review')
const rpcs = (name) => world.calls.filter((c) => c.rpc === name)
const draft = (over = {}) => ({
  kind: 'cocktail', name: 'Gin Basil', style: 'Long drink', blurb: 'Fris.', method: 'Roeren.', why: 'x',
  lines: [{ amount: '50 ml', ingredient: 'gin', items: [{ id: 1, name: 'Gin' }] }, { amount: '120 ml', ingredient: 'tonic', items: [{ id: 2, name: 'Tonic' }] }], ...over,
})
const mockDraft = () => draft({
  kind: 'mocktail', name: 'Appel Spark',
  lines: [{ amount: '100 ml', ingredient: 'appelsap', items: [{ id: 4, name: 'Appelsap' }] }, { amount: '100 ml', ingredient: 'bruiswater', items: [{ id: 5, name: 'Bruiswater' }] }],
})
const rawDrafts = (...ds) => ({ drafts: ds.map((d) => ({ kind: d.kind, name: d.name, style: d.style, blurb: d.blurb, method: d.method, why: d.why, lines: d.lines.map((l) => ({ amount: l.amount, ingredient: l.ingredient, item_ids: l.items.map((i) => i.id) })) })), note: null })

test.beforeEach(() => { world = baseWorld() })

// ================================================================ add
test('add: a signed draft is written once, on the menu, through the service role, after counting it against the limit', async () => {
  const token = await signDraft(draft(), SECRET)
  const res = await call({ action: 'add', token })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body, { status: 'ok', id: 42, kind: 'cocktail', name: 'Gin Basil' })
  const w = writes()
  assert.equal(w.length, 1)
  assert.equal(w[0].who, 'service')
  assert.deepEqual(w[0].args.p.lines[0], { amount: '50 ml', ingredient: 'gin', items: [1] })
  assert.equal(w[0].args.p.kind, 'cocktail')
  const claim = rpcs('claim_write')
  assert.equal(claim.length, 1)
  assert.equal(claim[0].args.p_kind, 'add')
  assert.match(claim[0].args.p_visitor, /^[0-9a-f]{24}$/)
  assert.equal(claim[0].args.p_visitor.includes('203'), false, 'never the IP address itself')
  // the limit is counted before the write
  assert.ok(world.calls.indexOf(claim[0]) < world.calls.indexOf(w[0]))
})

test('add: nobody writes with a token they made, changed or kept too long; nothing is counted or written', async () => {
  const good = await signDraft(draft(), SECRET)
  const [body, sig] = good.split('.')
  for (const token of ['', 'abc', 'a.b', `${body}.${sig.slice(0, -3)}AAA`, await signDraft(draft(), 'another-secret'), await signDraft(draft(), SECRET, Date.now() - 3 * 3600 * 1000), undefined, 5]) {
    const res = await call({ action: 'add', token })
    assert.equal(res.status, 400, String(token).slice(0, 20))
    assert.equal(res.body.code, 'expired')
  }
  assert.equal(writes().length, 0)
  assert.equal(rpcs('claim_write').length, 0)
})

test('add: a draft with something changed (a different name under the same signature) is refused', async () => {
  const good = await signDraft(draft(), SECRET)
  const [body, sig] = good.split('.')
  const swapped = JSON.parse(Buffer.from(body, 'base64url').toString())
  swapped.d.name = 'Gratis Bier'
  const forged = `${Buffer.from(JSON.stringify(swapped)).toString('base64url')}.${sig}`
  assert.equal((await call({ action: 'add', token: forged })).body.code, 'expired')
  assert.equal(writes().length, 0)
})

test('add: the admin can switch it off; then nothing is counted or written', async () => {
  world.settings = [{ key: 'guest_add_enabled', value: false }]
  const res = await call({ action: 'add', token: await signDraft(draft(), SECRET) })
  assert.deepEqual(res.body, { status: 'disabled' })
  assert.equal(writes().length, 0)
  assert.equal(rpcs('claim_write').length, 0)
})

test('add: a list that is switched off for visitors gets no new recipes either', async () => {
  world.settings = [{ key: 'menu_show_mocktails', value: false }]
  const res = await call({ action: 'add', token: await signDraft(mockDraft(), SECRET) })
  assert.deepEqual(res.body, { status: 'disabled' })
  assert.equal(writes().length, 0)
})

test('add: the name is taken (exists), or the stock changed (stale): no count, no write', async () => {
  world.recipes.push({ id: 12, kind: 'cocktail', name: 'gin basil', style: 'x', blurb: null, sort_order: 2, recipe_lines: [] })
  assert.deepEqual((await call({ action: 'add', token: await signDraft(draft(), SECRET) })).body, { status: 'exists' })
  world = baseWorld()
  world.items = world.items.map((i) => (i.id === 2 ? { ...i, in_stock: false } : i))     // the tonic ran out
  assert.deepEqual((await call({ action: 'add', token: await signDraft(draft(), SECRET) })).body, { status: 'stale' })
  assert.equal(writes().length, 0)
  assert.equal(rpcs('claim_write').length, 0)
})

test('add: a recipe with a link in its text is refused (a guest cannot make Claude advertise on the menu)', async () => {
  const token = await signDraft(draft({ blurb: 'Meer op www.spam.nl' }), SECRET)
  assert.deepEqual((await call({ action: 'add', token })).body, { status: 'refused' })
  assert.equal(writes().length, 0)
  assert.equal(rpcs('claim_write').length, 0)
})

test('add: a mocktail is only written if it still has no alcohol', async () => {
  const token = await signDraft(mockDraft(), SECRET)
  world.items = world.items.map((i) => (i.id === 4 ? { ...i, category_id: 1 } : i))      // Appelsap now sits in an alcoholic category
  assert.deepEqual((await call({ action: 'add', token })).body, { status: 'stale' })
  assert.equal(writes().length, 0)
})

test('add: over the limit nothing is written (per visitor and per day)', async () => {
  const token = await signDraft(draft(), SECRET)
  world.claim = 'visitor_limit'
  let res = await call({ action: 'add', token })
  assert.equal(res.status, 429)
  assert.equal(res.body.code, 'visitor_limit')
  world.claim = 'day_limit'
  res = await call({ action: 'add', token })
  assert.equal(res.status, 429)
  assert.equal(res.body.code, 'day_limit')
  world.claim = 'weird'
  assert.equal((await call({ action: 'add', token })).status, 503)
  assert.equal(writes().length, 0)
})

test('add: someone was quicker with the same name (database says duplicate): exists, not an error', async () => {
  world.addError = { code: '23505', message: 'duplicate key' }
  assert.deepEqual((await call({ action: 'add', token: await signDraft(draft(), SECRET) })).body, { status: 'exists' })
  world.addError = { code: 'XX000', message: 'boom' }
  assert.equal((await call({ action: 'add', token: await signDraft(draft(), SECRET) })).status, 500)
})

test('add: a dry run checks and counts but writes nothing', async () => {
  const res = await call({ action: 'add', token: await signDraft(draft(), SECRET), dry_run: true })
  assert.deepEqual(res.body, { status: 'dry_run', kind: 'cocktail', name: 'Gin Basil' })
  assert.equal(rpcs('claim_write').length, 1)
  assert.equal(writes().length, 0)
})

// ================================================================ review
const review = (over = {}) => call({ action: 'review', recipe_id: 10, rating: 4, name: ' Sanne ', text: 'Lekker fris', ...over })

test('review: a guest without a login writes a review; the visitor is a hash, the IP never reaches the table', async () => {
  const res = await review()
  assert.equal(res.status, 200)
  assert.equal(res.body.status, 'ok')
  assert.equal(res.body.review.rating, 4)
  const w = writes()
  assert.equal(w.length, 1)
  assert.equal(w[0].who, 'service')
  assert.equal(w[0].args.p_name, 'Sanne')
  assert.equal(w[0].args.p_body, 'Lekker fris')
  assert.match(w[0].args.p_visitor, /^[0-9a-f]{24}$/)
  assert.equal(JSON.stringify(w[0].args).includes('203.0.113'), false)
  assert.equal(Object.keys(res.body.review).includes('visitor'), false, 'the visitor hash is never sent back')
})

test('review: name and text are optional, the stars are not', async () => {
  assert.equal((await review({ name: undefined, text: undefined })).body.status, 'ok')
  assert.equal(writes()[0].args.p_name, null)
  assert.equal(writes()[0].args.p_body, null)
  for (const rating of [0, 6, 2.5, '5', null, undefined]) assert.equal((await review({ rating })).status, 400, String(rating))
  assert.equal(writes().length, 1)
})

test('review: links are refused', async () => {
  const res = await review({ text: 'kijk op www.spam.nl' })
  assert.equal(res.status, 400)
  assert.equal(res.body.code, 'links')
  assert.equal(writes().length, 0)
})

test('review: a robot that fills in the hidden field gets a friendly answer and nothing is stored or counted', async () => {
  const res = await review({ website: 'http://spam.example' })
  assert.deepEqual(res.body, { status: 'ok', review: null })
  assert.equal(writes().length, 0)
  assert.equal(rpcs('claim_write').length, 0)
})

test('review: only for a recipe that exists and that visitors can see', async () => {
  assert.equal((await review({ recipe_id: 999 })).status, 404)
  assert.equal((await review({ recipe_id: 'x' })).status, 404)
  world.settings = [{ key: 'menu_show_cocktails', value: false }]
  assert.equal((await review({ recipe_id: 10 })).status, 404)
  assert.equal(writes().length, 0)
})

test('review: the admin can switch reviews off', async () => {
  world.settings = [{ key: 'reviews_enabled', value: false }]
  assert.deepEqual((await review()).body, { status: 'disabled' })
  assert.equal(writes().length, 0)
})

test('review: one per visitor per recipe per day; the limit is not used up by a repeat', async () => {
  world.reviewCount = 1
  const res = await review()
  assert.equal(res.status, 409)
  assert.equal(res.body.code, 'already')
  assert.equal(rpcs('claim_write').length, 0)
  assert.equal(writes().length, 0)
})

test('review: over the limit nothing is written', async () => {
  world.claim = 'visitor_limit'
  assert.equal((await review()).status, 429)
  world.claim = 'day_limit'
  assert.equal((await review()).body.code, 'day_limit')
  assert.equal(writes().length, 0)
})

test('review: a dry run checks and counts but writes nothing', async () => {
  assert.deepEqual((await review({ dry_run: true })).body, { status: 'dry_run' })
  assert.equal(rpcs('claim_write').length, 1)
  assert.equal(writes().length, 0)
})

test('the same visitor gets the same hash, another visitor another one', async () => {
  await review(); await review({}, {})
  const same = world.calls.filter((c) => c.rpc === 'claim_write').map((c) => c.args.p_visitor)
  await call({ action: 'review', recipe_id: 10, rating: 3 }, { 'cf-connecting-ip': '198.51.100.9' })
  const other = world.calls.filter((c) => c.rpc === 'claim_write').map((c) => c.args.p_visitor).pop()
  assert.equal(same[0], same[1])
  assert.notEqual(same[0], other)
})

// ================================================================ suggest (new)
const suggestNew = (extra = {}) => call({ action: 'suggest', mode: 'new', wish: 'iets fruitigs', ...extra })

test('suggest new: a mocktail request is preset to no alcohol, and the draft comes back signed', async () => {
  world.claude = rawDrafts(mockDraft())
  const res = await suggestNew({ kind: 'mocktail' })
  assert.equal(res.status, 200)
  assert.equal(res.body.drafts.length, 1)
  assert.equal(res.body.drafts[0].kind, 'mocktail')
  assert.equal(typeof res.body.drafts[0].token, 'string')
  assert.match(world.claudeCalls[0].system, /kind must be "mocktail"/)
  // the token is exactly what "add" accepts
  const added = await call({ action: 'add', token: res.body.drafts[0].token })
  assert.equal(added.body.status, 'ok')
  assert.equal(writes()[0].args.p.kind, 'mocktail')
})

test('suggest new: with the mocktail preset a cocktail from Claude never gets through', async () => {
  world.claude = rawDrafts(draft())                                     // Claude disobeys and returns a cocktail
  const res = await suggestNew({ kind: 'mocktail' })
  assert.equal(res.body.drafts.length, 0)
})

test('suggest new: the cocktail preset gives a cocktail, but a wish for no alcohol still wins', async () => {
  world.claude = rawDrafts(draft())
  let res = await suggestNew({ kind: 'cocktail' })
  assert.equal(res.body.drafts[0].kind, 'cocktail')
  assert.match(world.claudeCalls[0].system, /kind must be "cocktail"/)
  world.claude = rawDrafts(mockDraft())
  res = await suggestNew({ kind: 'cocktail', wish: 'iets fris, zonder alcohol graag' })
  assert.equal(res.body.drafts[0].kind, 'mocktail')
  assert.match(world.claudeCalls[1].system, /kind must be "mocktail"/)
})

test('suggest new: no preset means either kind, as before', async () => {
  world.claude = rawDrafts(draft())
  await suggestNew()
  assert.match(world.claudeCalls[0].system, /kind is "cocktail".*or "mocktail"/)
})

test('suggest new: without the admin switch for guest adding no token is handed out', async () => {
  world.settings = [{ key: 'guest_add_enabled', value: false }]
  world.claude = rawDrafts(draft())
  const res = await suggestNew()
  assert.equal(res.body.drafts.length, 1)
  assert.equal('token' in res.body.drafts[0], false)
})

test('suggest existing: a recipe that asks for a kind of drink is on offer while any bottle of that kind is in stock', async () => {
  const ginLine = (items) => ({ sort_order: 1, amount: '50 ml', ingredient: 'gin', drink_sort: 'Gin', recipe_line_items: items.map((it) => ({ item_id: it.id, items: it })) })
  const bleu = item(31, "Bleu D'Argent", 1, { drink_sort: 'Gin', in_stock: false }), bombay = item(32, 'Bombay', 1, { drink_sort: 'gin' })
  world.items = [...world.items, bleu, bombay]
  world.recipes = [{ id: 10, kind: 'cocktail', name: 'Gin Tonic', style: 'Long', blurb: 'Fris.', sort_order: 1, recipe_lines: [ginLine([bleu])] }]
  world.claude = { picks: [{ recipe_id: 10, reason: 'Past.' }], note: null }
  assert.equal((await call({ action: 'suggest', mode: 'existing', wish: 'iets met gin' })).body.picks.length, 1)     // Bleu is out, Bombay is not
  world.items = world.items.map((i) => (i.id === 32 ? { ...i, in_stock: false } : i))
  const none = await call({ action: 'suggest', mode: 'existing', wish: 'iets met gin' })
  assert.deepEqual(none.body, { status: 'no_recipes' })                                                              // both out: not on offer, and Claude is not asked
  assert.equal(world.claudeCalls.length, 1)
})

test('suggest existing ignores the preset kind', async () => {
  world.recipes = [{ id: 10, kind: 'cocktail', name: 'Daiquiri', style: 'Sour', blurb: 'Fris.', sort_order: 1,
    recipe_lines: [{ sort_order: 1, amount: '50 ml', ingredient: 'gin', recipe_line_items: [{ item_id: 1, items: item(1, 'Gin', 1) }] }] }]
  world.claude = { picks: [{ recipe_id: 10, reason: 'Past.' }], note: null }
  const res = await call({ action: 'suggest', mode: 'existing', wish: 'iets met gin', kind: 'mocktail' })
  assert.equal(res.body.picks.length, 1)
  assert.equal(res.body.picks[0].kind, 'cocktail')
})

test('unknown actions and wrong methods are refused', async () => {
  assert.equal((await call({ action: 'drop table' })).status, 400)
  assert.equal((await call({})).status, 400)
  const res = await serve(new Request('https://example.supabase.co/x', { method: 'GET' }))
  assert.equal(res.status, 405)
})
