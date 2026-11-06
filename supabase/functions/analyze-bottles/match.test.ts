// Run with:  node --test supabase/functions/analyze-bottles/match.test.ts   (or: deno test supabase/functions/analyze-bottles/)
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLine, parseProduct, type CatalogItem, type Category } from './match.ts'

const catalog: CatalogItem[] = [
  { id: 1, name: 'Havana Club 3 Años', aliases: ['havana', 'rum wit'], barcode: '8501110080408' },
  { id: 2, name: 'Bacardi Carta Blanca', aliases: [], barcode: null },
  { id: 3, name: 'Bacardi Spiced', aliases: [], barcode: null },
  { id: 4, name: 'Gordon’s Gin', aliases: ['gordons'], barcode: null },
]

const categories: Category[] = [{ id: 1, label: 'Rum' }, { id: 2, label: 'Gin' }, { id: 7, label: 'Wijn' }]

const product = (over: Record<string, unknown>) =>
  parseProduct({ brand: null, name: null, barcode: null, count: 1, confidence: 0.9, item_id: null, category_id: null, abv: null, is_wine: false, wine: null, ...over })!

test('a unique barcode match is preselected, even when Claude is unsure', () => {
  const line = buildLine(product({ barcode: '8 501110 080408', confidence: 0.3 }), 0, catalog)
  assert.equal(line.item_id, 1)
  assert.equal(line.match, 'barcode')
  assert.deepEqual(line.issues, [])
})

test('an exact name or alias match is preselected', () => {
  const line = buildLine(product({ name: 'Gordons' }), 0, catalog)
  assert.equal(line.item_id, 4)
  assert.equal(line.match, 'name')
})

test('the catalog item Claude picked is preselected when confident', () => {
  const line = buildLine(product({ brand: 'Bacardi', name: 'Superior', item_id: 2 }), 0, catalog)
  assert.equal(line.item_id, 2)
  assert.equal(line.match, 'model')
})

test('an item_id that is not in the catalog is ignored', () => {
  const line = buildLine(product({ name: 'Something odd', item_id: 999 }), 0, catalog)
  assert.equal(line.item_id, null)
  assert.ok(line.issues.includes('no_match'))
})

test('a shaky match is not preselected but offered first', () => {
  const line = buildLine(product({ item_id: 2, confidence: 0.4 }), 0, catalog)
  assert.equal(line.item_id, null)
  assert.equal(line.match, null)
  assert.equal(line.candidates[0].id, 2)
  assert.deepEqual(line.issues, ['low_confidence'])
})

test('an unknown count is reported and left empty', () => {
  const line = buildLine(product({ name: 'Gordons', count: null }), 0, catalog)
  assert.equal(line.item_id, 4)
  assert.equal(line.detected.count, null)
  assert.deepEqual(line.issues, ['no_count'])
})

test('a partial name only suggests candidates', () => {
  const line = buildLine(product({ brand: 'Bacardi', name: null }), 0, catalog)
  assert.equal(line.item_id, null)
  assert.deepEqual(line.candidates.map((c) => c.id).sort(), [2, 3])
  assert.deepEqual(line.issues, ['no_match'])
})

test('a bottle with nothing readable gives an empty line, not an error', () => {
  const line = buildLine(product({ count: null, confidence: 0 }), 3, catalog)
  assert.equal(line.index, 3)
  assert.equal(line.item_id, null)
  assert.deepEqual(line.candidates, [])
  assert.deepEqual(line.issues, ['no_count', 'low_confidence', 'no_match'])
})

test('wine details are passed on only for wine', () => {
  const wine = { kind: 'Rood', grape: 'Merlot', region: null, alcohol: '13%', note: null }
  assert.deepEqual(buildLine(product({ is_wine: true, wine }), 0, catalog).wine, wine)
  assert.equal(buildLine(product({ is_wine: false, wine }), 0, catalog).wine, null)
})

test('wine is reported as wine even when nothing on the label could be read', () => {
  const line = buildLine(product({ is_wine: true, wine: null }), 0, catalog, categories)
  assert.equal(line.is_wine, true)
  assert.deepEqual(line.wine, { kind: null, grape: null, region: null, alcohol: null, note: null })
  assert.equal(line.suggested.category_id, 7)
})

test('wine goes in the wine category whatever else was suggested', () => {
  const line = buildLine(product({ is_wine: true, category_id: 1 }), 0, catalog, categories)
  assert.equal(line.suggested.category_id, 7)
})

test('a suggested category is kept when it exists and dropped when it does not', () => {
  assert.equal(buildLine(product({ category_id: 2 }), 0, catalog, categories).suggested.category_id, 2)
  assert.equal(buildLine(product({ category_id: 99 }), 0, catalog, categories).suggested.category_id, null)
  assert.equal(buildLine(product({ category_id: 2 }), 0, catalog).suggested.category_id, null) // no categories given
})

test('the alcohol percentage and the wine type are validated', () => {
  const p = parseProduct({ abv: 12.46, wine: { kind: 'Rosé', grape: null, region: null, alcohol: null, note: null } })!
  assert.equal(p.abv, 12.5)
  assert.equal(p.wine!.kind, 'Rosé')
  assert.equal(parseProduct({ abv: 140 })!.abv, null)
  assert.equal(parseProduct({ abv: 'strong' })!.abv, null)
  assert.equal(parseProduct({ wine: { kind: 'Oranje' } })!.wine!.kind, null)
})

test('parseProduct clamps odd values', () => {
  const p = parseProduct({ count: 500, confidence: 7, item_id: 1.5, brand: '  Gin  ' })!
  assert.equal(p.count, null)
  assert.equal(p.confidence, 1)
  assert.equal(p.item_id, null)
  assert.equal(p.brand, 'Gin')
  assert.equal(parseProduct('nope'), null)
})

test('a remembered name (alias) makes the same label match by itself next time', () => {
  const label = product({ brand: 'J&B', name: 'Rare Blend' })
  const before: CatalogItem[] = [{ id: 52, name: 'J&B Rare', aliases: [], barcode: null }]
  const after: CatalogItem[] = [{ id: 52, name: 'J&B Rare', aliases: ['J&B Rare Blend'], barcode: null }]
  const first = buildLine(label, 0, before)
  assert.equal(first.item_id, null) // only a suggestion: the admin has to choose
  assert.equal(first.candidates[0].id, 52)
  const second = buildLine(label, 0, after)
  assert.equal(second.item_id, 52)
  assert.equal(second.match, 'name')
})

test('a remembered barcode matches the same bottle next time', () => {
  const label = product({ barcode: '5000299225004', name: 'Unreadable' })
  assert.equal(buildLine(label, 0, [{ id: 52, name: 'J&B Rare', aliases: [], barcode: null }]).item_id, null)
  const line = buildLine(label, 0, [{ id: 52, name: 'J&B Rare', aliases: [], barcode: '5000299225004' }])
  assert.equal(line.item_id, 52)
  assert.equal(line.match, 'barcode')
})
