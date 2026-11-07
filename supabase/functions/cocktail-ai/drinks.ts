// Pure logic of cocktail-ai (no Deno or network imports), so it can be tested with `node --test` or `deno test`.
// It prepares what Claude gets to see (the drinks that can be made right now, or the ingredients in stock) and checks Claude's answer
// against that. Nothing here writes anything.
//
//   suggest  (visitors)  pick the cocktails and mocktails that fit what the guest feels like         → buildSuggestions
//   invent   (admins)    draft new recipes that only use ingredients in stock, for the admin to check → buildDrafts

export type Kind = 'cocktail' | 'mocktail'

export const MAX_WISH_CHARS = 300
export const MAX_PICKS = 3
export const MAX_DRAFTS = 3
export const MAX_LINES = 8
const MAX_UNLINKED_LINES = 2 // ice, water or a garnish that is not in the item list; everything else must be linked to an item

const KINDS: Kind[] = ['cocktail', 'mocktail']
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const result = value.replace(/\s+/g, ' ').trim()
  return result.length ? result.slice(0, max) : null
}
const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

// What a guest or the admin typed: one line, trimmed, limited in length. Angle brackets go, so the text cannot close the tag it is put in.
export function cleanWish(raw: unknown, max = MAX_WISH_CHARS): string {
  return typeof raw === 'string' ? raw.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim() : ''
}

// ---------------------------------------------------------------- settings (table `settings`, the same defaults as js/data-loader.js)

export type Settings = { hideOut: boolean; showCocktails: boolean; showMocktails: boolean; suggestEnabled: boolean }

export function toSettings(rows: unknown): Settings {
  const map = new Map<string, unknown>()
  if (Array.isArray(rows)) for (const r of rows) if (isObject(r) && typeof r.key === 'string') map.set(r.key, r.value)
  return {
    hideOut: map.get('hide_unavailable_recipes') !== false,
    showCocktails: map.get('menu_show_cocktails') !== false,
    showMocktails: map.get('menu_show_mocktails') !== false,
    suggestEnabled: map.get('suggest_enabled') !== false,
  }
}

// ---------------------------------------------------------------- recipes that can be made (the same rule as js/stock.js)

export type PoolItem = { id: number; name: string; inStock: boolean; inCocktails: boolean }
export type PoolLine = { amount: string; text: string; items: PoolItem[] }
export type PoolRecipe = { id: number; kind: Kind; name: string; style: string; blurb: string | null; lines: PoolLine[] }

// Rows of `recipes` with recipe_lines(sort_order,amount,ingredient,recipe_line_items(item_id,items(id,name,in_stock,in_cocktails))).
export function toRecipes(rows: unknown): PoolRecipe[] {
  if (!Array.isArray(rows)) return []
  const recipes: PoolRecipe[] = []
  for (const raw of rows) {
    if (!isObject(raw) || typeof raw.id !== 'number' || !KINDS.includes(raw.kind as Kind)) continue
    const name = text(raw.name, 120)
    if (!name) continue
    const rawLines = (Array.isArray(raw.recipe_lines) ? raw.recipe_lines : []).filter(isObject)
    rawLines.sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    const lines: PoolLine[] = []
    for (const l of rawLines) {
      const items: PoolItem[] = []
      for (const link of Array.isArray(l.recipe_line_items) ? l.recipe_line_items : []) {
        const it = isObject(link) ? one(link.items as Record<string, unknown> | Record<string, unknown>[]) : null
        const id = isObject(link) && typeof link.item_id === 'number' ? link.item_id : null
        const itemName = it ? text(it.name, 120) : null
        if (!it || id === null || !itemName) continue
        items.push({ id, name: itemName, inStock: Boolean(it.in_stock), inCocktails: it.in_cocktails !== false })
      }
      const t = text(l.ingredient, 120)
      if (t) lines.push({ amount: text(l.amount, 40) ?? '', text: t, items })
    }
    recipes.push({ id: raw.id, kind: raw.kind as Kind, name, style: text(raw.style, 60) ?? '', blurb: text(raw.blurb, 200), lines })
  }
  return recipes
}

// Can this recipe be made right now? Every line that is linked to items needs one that is in stock (unless the setting that hides recipes
// when something ran out is off) and that is allowed in cocktails. A line without links (ice) is not tracked.
export const canMix = (r: PoolRecipe, hideOut: boolean): boolean =>
  r.lines.filter((l) => l.items.length).every((l) => l.items.some((i) => !((hideOut && !i.inStock) || !i.inCocktails)))

// What a visitor can pick from: the cocktails and mocktails that can be made, unless the admin switched that list off for visitors.
export function availableRecipes(rows: unknown, settings: Settings): PoolRecipe[] {
  return toRecipes(rows).filter((r) =>
    (r.kind === 'cocktail' ? settings.showCocktails : settings.showMocktails) && canMix(r, settings.hideOut))
}

const cell = (s: string | null) => (s ?? '').replace(/[\r\n|]+/g, ' ').trim()

// One line per drink: "id | kind | style | name | description | ingredients". Data for Claude to choose from, not instructions.
export function recipeListText(recipes: PoolRecipe[]): string {
  return recipes
    .map((r) => [r.id, r.kind, cell(r.style), cell(r.name), cell(r.blurb), cell(r.lines.map((l) => `${l.amount} ${l.text}`.trim()).join('; '))].join(' | '))
    .join('\n')
}

// ---------------------------------------------------------------- suggest: the answer for a guest

export type Suggestion = { recipe_id: number; name: string; kind: Kind; style: string; reason: string }
export type Suggestions = { picks: Suggestion[]; note: string | null }

// Keeps only drinks from the list (a drink that is not on it, or that cannot be made, never reaches the website), each at most once.
export function buildSuggestions(raw: unknown, pool: PoolRecipe[]): Suggestions {
  const byId = new Map(pool.map((r) => [r.id, r]))
  const answer = isObject(raw) ? raw : {}
  const picks: Suggestion[] = []
  const used = new Set<number>()
  for (const p of Array.isArray(answer.picks) ? answer.picks : []) {
    const recipe = isObject(p) && typeof p.recipe_id === 'number' ? byId.get(p.recipe_id) : undefined
    if (!recipe || used.has(recipe.id)) continue
    used.add(recipe.id)
    picks.push({ recipe_id: recipe.id, name: recipe.name, kind: recipe.kind, style: recipe.style, reason: text((p as Record<string, unknown>).reason, 300) ?? '' })
    if (picks.length === MAX_PICKS) break
  }
  let note = text(answer.note, 400)
  if (!picks.length && !note) note = 'Daar kan ik nu niets bij vinden. Probeer het met andere woorden, bijvoorbeeld "fris en niet te zoet".'
  return { picks, note }
}

// ---------------------------------------------------------------- invent: ingredients in stock and drafts for the admin

export type Ingredient = { id: number; name: string; category: string; alcoholic: boolean; note: string | null }

// Items that can go into a new recipe: in stock, allowed in cocktails and not "only a loose drink". The alcohol flag follows the
// category (a 0.0% drink is alcohol-free); an item without a category is a plain ingredient.
export function toIngredients(items: unknown, categories: unknown): Ingredient[] {
  const cats = new Map<number, { label: string; alcoholic: boolean }>()
  if (Array.isArray(categories)) {
    for (const c of categories) if (isObject(c) && typeof c.id === 'number') cats.set(c.id, { label: text(c.label, 60) ?? '', alcoholic: c.alcoholic === true })
  }
  const list: Ingredient[] = []
  const seen = new Set<number>()
  for (const raw of Array.isArray(items) ? items : []) {
    if (!isObject(raw) || typeof raw.id !== 'number' || seen.has(raw.id)) continue
    const name = text(raw.name, 120)
    if (!name || !raw.in_stock || raw.in_cocktails === false || raw.serving === 'drink') continue
    const cat = typeof raw.category_id === 'number' ? cats.get(raw.category_id) : undefined
    seen.add(raw.id)
    list.push({ id: raw.id, name, category: cat?.label ?? '', alcoholic: cat?.alcoholic === true && raw.zero_proof !== true, note: text(raw.note, 200) })
  }
  return list
}

// One line per ingredient: "id | name | category | alcohol or no alcohol | note".
export function ingredientListText(list: Ingredient[]): string {
  return list.map((i) => [i.id, cell(i.name), cell(i.category), i.alcoholic ? 'alcohol' : 'no alcohol', cell(i.note)].join(' | ')).join('\n')
}

// The recipes the bar already has, for Claude to avoid copying them and to follow the house style: "kind | style | name | ingredients".
export function existingListText(recipes: PoolRecipe[]): string {
  return recipes.map((r) => [r.kind, cell(r.style), cell(r.name), cell(r.lines.map((l) => `${l.amount} ${l.text}`.trim()).join('; '))].join(' | ')).join('\n')
}

export type DraftLine = { amount: string; ingredient: string; items: { id: number; name: string }[] }
export type Draft = { name: string; style: string; blurb: string | null; method: string | null; why: string | null; lines: DraftLine[] }
export type Drafts = { drafts: Draft[]; note: string | null }

// Validates the new recipes Claude drafted. A draft is dropped when it copies the name of an existing recipe (of the same kind), has
// fewer than two ingredients linked to items, leans on things that are not in stock, or breaks its kind (alcohol in a mocktail,
// no alcohol in a cocktail). Unknown item ids are removed from a line. The admin still checks every draft before it is saved.
export function buildDrafts(raw: unknown, kind: Kind, ingredients: Ingredient[], existing: { kind: string; name: string }[]): Drafts {
  const byId = new Map(ingredients.map((i) => [i.id, i]))
  const taken = new Set(existing.filter((e) => e.kind === kind).map((e) => fold(e.name).trim()))
  const answer = isObject(raw) ? raw : {}
  const drafts: Draft[] = []

  for (const d of Array.isArray(answer.drafts) ? answer.drafts : []) {
    if (!isObject(d)) continue
    const name = text(d.name, 80)
    if (!name || taken.has(fold(name))) continue

    const lines: DraftLine[] = []
    let unlinked = 0
    let alcohol = false
    for (const l of (Array.isArray(d.lines) ? d.lines : []).slice(0, MAX_LINES)) {
      if (!isObject(l)) continue
      const ingredient = text(l.ingredient, 120)
      if (!ingredient) continue
      const items: { id: number; name: string }[] = []
      for (const id of Array.isArray(l.item_ids) ? l.item_ids : []) {
        const found = typeof id === 'number' ? byId.get(id) : undefined
        if (!found || items.some((x) => x.id === found.id)) continue
        items.push({ id: found.id, name: found.name })
        if (found.alcoholic) alcohol = true
        if (items.length === 3) break
      }
      if (!items.length) unlinked++
      lines.push({ amount: text(l.amount, 40) ?? '', ingredient, items })
    }

    const linked = lines.length - unlinked
    if (linked < 2 || unlinked > MAX_UNLINKED_LINES) continue
    if (kind === 'mocktail' ? alcohol : !alcohol) continue

    taken.add(fold(name))
    drafts.push({
      name,
      style: text(d.style, 40) ?? 'Eigen creatie',
      blurb: text(d.blurb, 300),
      method: text(d.method, 800),
      why: text(d.why, 300),
      lines,
    })
    if (drafts.length === MAX_DRAFTS) break
  }

  let note = text(answer.note, 400)
  if (!drafts.length && !note) note = 'Ik kon met wat er nu op voorraad is geen nieuw recept bedenken. Probeer het met andere woorden of vul eerst de voorraad aan.'
  return { drafts, note }
}
