// Run with:  node --test tests/*.test.mjs
// js/ingredient-links.js (beheerder: per receptregel de items uit de voorraad en of ze op zijn). De DOM-kant is in de browser bekeken; hier de
// gegevens per regel, samen met de echte js/data-loader.js en js/stock.js: dezelfde regels als waarmee de site bepaalt of een recept kan.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const loaderCode = readFileSync(new URL('../js/data-loader.js', import.meta.url), 'utf8')
const stockCode = readFileSync(new URL('../js/stock.js', import.meta.url), 'utf8')
const linksCode = readFileSync(new URL('../js/ingredient-links.js', import.meta.url), 'utf8')

const cat = (id, label, kind, alcoholic) => ({ id, label, kind, alcoholic, show_alcohol: false, sort_order: id })
const item = (id, name, category_id, over = {}) => ({ id, category_id, name, note: null, zero_proof: false, in_stock: true, quantity: 1, in_cocktails: true, abv: null, serving: 'ingredient', sort_order: id, barcode: null, drink_sort: null, ...over })
const link = (it) => ({ item_id: it.id, items: { name: it.name } })
const line = (id, order, amount, ingredient, items, drink_sort) => ({ id, sort_order: order, amount, ingredient, drink_sort: drink_sort ?? null, recipe_line_items: items.map(link) })

function fakeSb(w) {
  const table = (name) => {
    const res = name === 'categories' ? w.categories : name === 'items' ? w.items : name === 'recipes' ? w.recipes : []
    const b = { order: () => b, then: (ok, fail) => Promise.resolve({ data: res, error: null }).then(ok, fail) }
    return b
  }
  return { from: (name) => ({ select: () => table(name) }), storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: 'https://x/' + p } }) }) } }
}

// loads the loader and stock.js the way the pages do, and hands back what ingredient-links needs
async function world(w) {
  const win = { kelderConfigured: true, kelderSb: fakeSb(w) }
  new Function('window', loaderCode)(win)
  await win.kelderLoadData()
  const stock = new Function('R', 'Z', 'OUT', 'NO_MIX', 'setting', `${stockCode}; return { isOut, noMix };`)(win.R, win.Z, win.OUT, win.NO_MIX, win.setting)
  const links = {}
  new Function('window', linksCode)(links)
  const byName = new Map(win.kelderRows.items.map((i) => [i.name, i]))
  return { win, links: links.kelderIngredientLinks, ctx: { rowOf: (n) => byName.get(n), ...stock } }
}

const stocked = () => {
  const gin = item(1, 'Bleu', 10, { drink_sort: 'Gin' }), vodka = item(2, 'Eristoff', 10), vanilia = item(3, 'Absolut Vanilia', 10, { in_stock: false, quantity: 0 })
  const soplica = item(4, 'Soplica', 10, { in_cocktails: false }), ice = item(5, 'Crushed ice', 12, { in_stock: false, quantity: 0 })
  return {
    categories: [cat(10, 'Iets Sterker', 'bottle', true), cat(12, 'Voorraad', 'ingredient', false)],
    items: [gin, vodka, vanilia, soplica, ice],
    recipes: [{
      id: 100, on_menu: true, kind: 'cocktail', name: 'Test', style: 'Sour', blurb: null, method: null, url: null, sort_order: 1, recipe_bottles: [],
      recipe_lines: [
        line(1, 1, '60 ml', 'gin', [gin]),                              // in stock
        line(2, 2, '20 ml', 'vodka', [vodka, vanilia]),                 // alternatives, one of them out
        line(3, 3, '10 ml', 'soplica', [soplica]),                      // not used in cocktails
        line(4, 4, '1', 'ijs', [ice]),                                  // out of stock
        line(5, 5, 'scheut', 'water', []),                              // no item linked: not tracked
        line(6, 6, '50 ml', 'tequila', [], 'Tequila'),                  // asks for a sort of which nothing is in the house
      ],
    }],
  }
}

test('every state of a line is told apart', async () => {
  const { win, links, ctx } = await world(stocked())
  const [gin, alt, nomix, out, none, virtual] = win.R[0].lines.map((l) => links.describe(l, ctx))

  assert.equal(gin.tracked, true)
  assert.deepEqual(gin.options.map((o) => [o.name, o.out, o.noMix, !!o.row]), [['Bleu', false, false, true]])

  assert.deepEqual(alt.options.map((o) => [o.name, o.out]), [['Eristoff', false], ['Absolut Vanilia', true]], 'alternatives each get their own state')

  assert.deepEqual(nomix.options.map((o) => [o.name, o.out, o.noMix]), [['Soplica', false, true]])
  assert.deepEqual(out.options.map((o) => [o.name, o.out, o.noMix]), [['Crushed ice', true, false]])

  assert.equal(none.tracked, false, 'a line without an item is not tracked in the stock')
  assert.deepEqual(none.options, [])

  assert.equal(virtual.sort, 'Tequila')
  assert.deepEqual(virtual.options.map((o) => [o.name, o.out, !!o.row]), [['Tequila (geen in huis)', true, false]], 'no item of that sort: out, and nothing to open')
})

test('an option that is a real item carries its row, so a click can open the item', async () => {
  const { win, links, ctx } = await world(stocked())
  const o = links.describe(win.R[0].lines[1], ctx).options[1]
  assert.equal(o.row.id, 3)
  assert.equal(o.row.name, 'Absolut Vanilia')
})
