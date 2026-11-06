// Pure logic of analyze-bottles (no Deno or network imports), so it can be tested with `node --test` or `deno test`.
// It turns what Claude saw on the photo into one draft line per bottle product. Nothing here writes anything.

export type WineDetails = {
  kind: string | null // Bubbels, Wit, Rosé or Rood
  grape: string | null
  region: string | null
  alcohol: string | null
  note: string | null
}
export type DetectedProduct = {
  brand: string | null
  name: string | null
  barcode: string | null
  count: number | null
  confidence: number
  item_id: number | null // the catalog item Claude says this is (checked against the catalog below)
  category_id: number | null // the category Claude thinks fits (checked against the categories below)
  abv: number | null // alcohol percentage printed on the label
  is_wine: boolean
  wine: WineDetails | null
}
export type CatalogItem = {
  id: number
  name: string
  aliases: string[] | null
  barcode: string | null
}

export type Category = { id: number; label: string }
export const WINE_KINDS = ['Bubbels', 'Wit', 'Rosé', 'Rood']
const WINE_LABELS = ['Wijn', 'Wijn & bubbels'] // the category with wine is called "Wijn" (earlier "Wijn & bubbels")

export type Issue = 'no_count' | 'low_confidence' | 'no_match'
export type HowMatched = 'barcode' | 'model' | 'name'
export type DraftLine = {
  index: number
  detected: { brand: string | null; name: string | null; barcode: string | null; count: number | null; confidence: number }
  // Only set when the match is sure enough to preselect. A shaky match is offered first in `candidates` instead.
  item_id: number | null
  match: HowMatched | null
  candidates: Array<{ id: number; name: string; barcode: string | null }>
  issues: Issue[]
  is_wine: boolean
  // What the photo suggests for a bottle that turns out to be new; the website prefills these and the admin can change them.
  suggested: { category_id: number | null; abv: number | null }
  wine: WineDetails | null
}

export const MIN_CONFIDENCE = 0.65

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function normalizeBarcode(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const result = value.trim()
  return result.length ? result.slice(0, 500) : null
}

// Validates and clamps one product from Claude's answer, so a surprising answer can never reach the website as-is.
export function parseProduct(raw: unknown): DetectedProduct | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const wineRaw = p.wine && typeof p.wine === 'object'
    ? p.wine as Record<string, unknown>
    : null
  const count = typeof p.count === 'number' && Number.isInteger(p.count) && p.count > 0 && p.count <= 100
    ? p.count
    : null
  const confidence = typeof p.confidence === 'number'
    ? Math.max(0, Math.min(1, p.confidence))
    : 0
  const itemId = typeof p.item_id === 'number' && Number.isInteger(p.item_id) ? p.item_id : null
  const categoryId = typeof p.category_id === 'number' && Number.isInteger(p.category_id) ? p.category_id : null
  const abv = typeof p.abv === 'number' && Number.isFinite(p.abv) && p.abv >= 0 && p.abv <= 100 ? Math.round(p.abv * 10) / 10 : null
  const kind = wineRaw && typeof wineRaw.kind === 'string' && WINE_KINDS.includes(wineRaw.kind) ? wineRaw.kind : null

  return {
    brand: textOrNull(p.brand),
    name: textOrNull(p.name),
    barcode: textOrNull(p.barcode),
    count,
    confidence,
    item_id: itemId,
    category_id: categoryId,
    abv,
    is_wine: p.is_wine === true,
    wine: wineRaw
      ? {
          kind,
          grape: textOrNull(wineRaw.grape),
          region: textOrNull(wineRaw.region),
          alcohol: textOrNull(wineRaw.alcohol),
          note: textOrNull(wineRaw.note),
        }
      : null,
  }
}

function productLabels(product: DetectedProduct): string[] {
  const labels = [product.name, product.brand && product.name ? `${product.brand} ${product.name}` : null, product.brand]
    .filter((v): v is string => Boolean(v))
    .map(normalizeText)
    .filter((v) => v.length >= 3)
  return [...new Set(labels)]
}

function catalogKeys(item: CatalogItem): string[] {
  return [item.name, ...(item.aliases ?? [])]
    .map(normalizeText)
    .filter((v) => v.length >= 3)
}

// Finds catalog items by barcode, then exact name or alias, then (as suggestions only) partial names.
export function matchCandidates(product: DetectedProduct, items: CatalogItem[]) {
  const barcode = normalizeBarcode(product.barcode)
  if (barcode) {
    const barcodeMatches = items.filter((item) => normalizeBarcode(item.barcode) === barcode)
    if (barcodeMatches.length === 1) return { matched: barcodeMatches[0], how: 'barcode' as const, candidates: barcodeMatches }
    if (barcodeMatches.length > 1) return { matched: null, how: null, candidates: barcodeMatches.slice(0, 5) }
  }

  const labels = productLabels(product)
  const exactMatches = items.filter((item) => {
    const keys = catalogKeys(item)
    return labels.some((label) => keys.includes(label))
  })
  if (exactMatches.length === 1) return { matched: exactMatches[0], how: 'name' as const, candidates: exactMatches }
  if (exactMatches.length > 1) return { matched: null, how: null, candidates: exactMatches.slice(0, 5) }

  const fuzzy = items
    .map((item) => {
      const keys = catalogKeys(item)
      const score = Math.max(0, ...labels.flatMap((label) => keys.map((key) => {
        if (label === key) return 100
        if (label.length >= 4 && key.includes(label)) return 60
        if (key.length >= 4 && label.includes(key)) return 50
        return 0
      })))
      return { item, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.item)
  return { matched: null, how: null, candidates: fuzzy }
}

// One draft line per detected product. Never throws on missing information: whatever is unknown is reported in `issues`
// and left empty, and the website lets the admin fill it in.
export function buildLine(product: DetectedProduct, index: number, catalog: CatalogItem[], categories: Category[] = []): DraftLine {
  const text = matchCandidates(product, catalog)
  const fromModel = product.item_id === null ? null : catalog.find((item) => item.id === product.item_id) ?? null

  // A unique barcode match beats everything; then what Claude picked from the catalog; then an exact name or alias.
  let matched: CatalogItem | null = null
  let how: HowMatched | null = null
  if (text.how === 'barcode') { matched = text.matched; how = 'barcode' }
  else if (fromModel) { matched = fromModel; how = 'model' }
  else if (text.how === 'name') { matched = text.matched; how = 'name' }

  const sure = how === 'barcode' || product.confidence >= MIN_CONFIDENCE

  const issues: Issue[] = []
  if (!product.count) issues.push('no_count')
  if (!sure) issues.push('low_confidence')
  if (!matched) issues.push('no_match')

  // Category for a new bottle: what Claude picked if it exists; wine always goes in the wine category.
  const wineCategory = categories.find((c) => WINE_LABELS.includes(c.label)) ?? null
  let categoryId = product.category_id !== null && categories.some((c) => c.id === product.category_id) ? product.category_id : null
  if (product.is_wine && wineCategory) categoryId = wineCategory.id

  const seen = new Set<number>()
  const candidates = [matched, fromModel, ...text.candidates]
    .filter((item): item is CatalogItem => item !== null && !seen.has(item.id) && Boolean(seen.add(item.id)))
    .slice(0, 5)
    .map((item) => ({ id: item.id, name: item.name, barcode: item.barcode }))

  return {
    index,
    detected: {
      brand: product.brand,
      name: product.name,
      barcode: product.barcode,
      count: product.count,
      confidence: product.confidence,
    },
    item_id: matched && sure ? matched.id : null,
    match: matched && sure ? how : null,
    candidates,
    issues,
    is_wine: product.is_wine,
    suggested: { category_id: categoryId, abv: product.abv },
    // Wine is always reported as wine, even when nothing on the label could be read: the admin fills in the rest.
    wine: product.is_wine ? (product.wine ?? { kind: null, grape: null, region: null, alcohol: null, note: null }) : null,
  }
}
