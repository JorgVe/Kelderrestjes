// Run with:  node --test tests/*.test.mjs
// Tests the controlecijfer-check van js/scanner.js zonder browser: het bestand wordt met een neppe `window` uitgevoerd.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const code = readFileSync(new URL('../js/scanner.js', import.meta.url), 'utf8')
const win = {}
new Function('window', code)(win)
const { checksumOk } = win.kelderScanner

test('EAN-13 with a correct check digit', () => {
  assert.equal(checksumOk('4006381333931', 'ean_13'), true)
  assert.equal(checksumOk('5449000000996', 'ean_13'), true)
})

test('EAN-8 and UPC-A with a correct check digit', () => {
  assert.equal(checksumOk('96385074', 'ean_8'), true)
  assert.equal(checksumOk('036000291452', 'upc_a'), true)
})

test('a wrong check digit is refused, for every digit that can be misread', () => {
  for (const [raw, format] of [['4006381333931', 'ean_13'], ['96385074', 'ean_8'], ['036000291452', 'upc_a']]) {
    for (let i = 0; i < raw.length; i++) {
      for (const d of '0123456789') {
        if (d === raw[i]) continue
        assert.equal(checksumOk(raw.slice(0, i) + d + raw.slice(i + 1), format), false, `${raw} met ${d} op plaats ${i}`)
      }
    }
  }
})

test('other formats, wrong lengths and non-digits are never verified', () => {
  assert.equal(checksumOk('4006381333931', 'code_128'), false)
  assert.equal(checksumOk('4006381333931', 'upc_e'), false)
  assert.equal(checksumOk('400638133393', 'ean_13'), false)
  assert.equal(checksumOk('40063813339X1', 'ean_13'), false)
  assert.equal(checksumOk(undefined, 'ean_13'), false)
})
