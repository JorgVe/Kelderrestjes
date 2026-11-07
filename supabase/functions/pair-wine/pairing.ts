// Pure logic of pair-wine (no Deno or network imports), so it can be tested with `node --test` or `deno test`.
// It prepares the list of wines in stock for Claude and checks Claude's answer against that list. Nothing here writes anything.

export type StockWine = {
  id: number
  name: string
  kind: string | null // Bubbels, Wit, Rosé or Rood
  grape: string | null
  region: string | null
  note: string | null
  quantity: number | null // null = in stock, number of bottles not known
}
export type Pick = {
  item_id: number
  name: string
  kind: string | null
  grape: string | null
  region: string | null
  quantity: number | null
  reason: string
}
export type Course = { dish: string; picks: Pick[]; note: string | null }
export type Pairing = { courses: Course[]; one_bottle: Pick | null; note: string | null }

export const MAX_MENU_CHARS = 1000
export const MAX_COURSES = 6
export const MAX_PICKS = 2
const KIND_ORDER = ['Bubbels', 'Wit', 'Rosé', 'Rood']

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const result = value.replace(/\s+/g, ' ').trim()
  return result.length ? result.slice(0, max) : null
}

// The menu as typed by the admin: trimmed, line breaks kept (one dish per line is common), limited in length.
export function cleanMenu(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_MENU_CHARS).trim()
}

// Turns the rows of `wines` (joined with `items`) into the wines that can be served: marked "in stock" and not at zero bottles.
// A wine with an unknown number of bottles (null) counts as in stock.
export function toStockWines(rows: unknown): StockWine[] {
  if (!Array.isArray(rows)) return []
  const wines: StockWine[] = []
  const seen = new Set<number>()
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const joined = Array.isArray(row.items) ? row.items[0] : row.items
    if (!joined || typeof joined !== 'object') continue
    const item = joined as Record<string, unknown>
    const id = typeof row.item_id === 'number' ? row.item_id : typeof item.id === 'number' ? item.id : null
    const name = text(item.name, 120)
    if (id === null || !name || seen.has(id)) continue
    const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : null
    if (item.in_stock !== true || (quantity !== null && quantity <= 0)) continue
    seen.add(id)
    wines.push({
      id,
      name,
      kind: typeof row.kind === 'string' && KIND_ORDER.includes(row.kind) ? row.kind : null,
      grape: text(row.grape, 100),
      region: text(row.region, 100),
      note: text(item.note, 300),
      quantity,
    })
  }
  const rank = (w: StockWine) => (w.kind ? KIND_ORDER.indexOf(w.kind) : KIND_ORDER.length)
  return wines.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}

// One line per wine: "id | name | kind | grape | region | note | bottles". Data for Claude to choose from, not instructions.
export function wineListText(wines: StockWine[]): string {
  const cell = (s: string | null) => (s ?? '').replace(/[\r\n|]+/g, ' ').trim()
  return wines
    .map((w) => [w.id, cell(w.name), cell(w.kind), cell(w.grape), cell(w.region), cell(w.note), w.quantity === null ? 'unknown' : w.quantity].join(' | '))
    .join('\n')
}

function toPick(raw: unknown, byId: Map<number, StockWine>): Pick | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const wine = typeof p.item_id === 'number' ? byId.get(p.item_id) : undefined
  if (!wine) return null // a wine that is not in stock (or invented) never reaches the website
  return {
    item_id: wine.id,
    name: wine.name,
    kind: wine.kind,
    grape: wine.grape,
    region: wine.region,
    quantity: wine.quantity,
    reason: text(p.reason, 400) ?? '',
  }
}

// Validates and enriches Claude's answer: only wines from the stock list, at most MAX_PICKS per course, never the same wine twice
// in a course, and a "one bottle" only when the menu has more than one course.
export function buildPairing(raw: unknown, wines: StockWine[]): Pairing {
  const byId = new Map(wines.map((w) => [w.id, w]))
  const answer = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}

  const courses: Course[] = []
  for (const rawCourse of Array.isArray(answer.courses) ? answer.courses.slice(0, MAX_COURSES) : []) {
    if (!rawCourse || typeof rawCourse !== 'object') continue
    const c = rawCourse as Record<string, unknown>
    const used = new Set<number>()
    const picks: Pick[] = []
    for (const rawPick of Array.isArray(c.picks) ? c.picks : []) {
      const pick = toPick(rawPick, byId)
      if (!pick || used.has(pick.item_id)) continue
      used.add(pick.item_id)
      picks.push(pick)
      if (picks.length === MAX_PICKS) break
    }
    const dish = text(c.dish, 120) ?? ''
    let note = text(c.note, 400)
    if (!picks.length && !note) note = 'Hier past geen wijn uit je voorraad bij.'
    if (!dish && !picks.length) continue
    courses.push({ dish, picks, note })
  }

  const oneBottle = courses.length > 1 ? toPick(answer.one_bottle, byId) : null
  let note = text(answer.note, 500)
  if (!courses.length && !note) note = 'Ik kon in deze tekst geen gerecht herkennen. Beschrijf wat je serveert, bijvoorbeeld: soep, vis en een dessert.'
  return { courses, one_bottle: oneBottle, note }
}
