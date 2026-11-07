// Run with:  node --test tests/*.test.mjs
// Tests the etiketfoto-functies van js/admin.js (saveWineLabel, saveWineLabelFromScan, clearWineLabel) zonder browser en zonder Supabase:
// het bestand wordt met een neppe `window` en een neppe client uitgevoerd. De neppe client onthoudt wat er is aangeroepen, in volgorde.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const code = readFileSync(new URL('../js/admin.js', import.meta.url), 'utf8')

// hetzelfde patroon als de controle op wines.label_path in supabase/migrations/0029_wine_label_photo.sql
const PATH_OK = /^[0-9]+\/[0-9]+-[0-9a-z]+\.(jpg|png|webp)$/

function load(opts = {}) {
  const log = []
  const sb = {
    storage: {
      from: bucket => ({
        upload: async (path, blob, o) => {
          log.push(['upload', bucket, path, o.contentType, o.upsert])
          return opts.uploadError ? { data: null, error: opts.uploadError } : { data: { path }, error: null }
        },
        remove: async paths => { log.push(['remove', bucket, ...paths]); return { data: [], error: opts.removeError || null } },
        download: async path => {
          log.push(['download', bucket, path])
          return opts.download || { data: new Blob(['scan'], { type: 'image/jpeg' }), error: null }
        }
      })
    },
    from: table => ({
      update: patch => ({
        eq: (col, val) => ({
          select: async () => {
            log.push(['update', table, patch, col, val])
            return opts.update || { data: [{ id: 1 }], error: null }
          }
        })
      })
    })
  }
  const win = { kelderConfigured: true, KELDER_SUPABASE: { url: 'https://x.supabase.co', publishableKey: 'k' }, supabase: { createClient: () => sb } }
  new Function('window', code)(win) // createImageBitmap bestaat hier niet: shrinkImage valt dan terug op het origineel
  return { admin: win.kelderAdmin, log }
}
const jpeg = (n = 10) => new Blob([new Uint8Array(n)], { type: 'image/jpeg' })

test('a new label: upload, then set the path, then remove the old file', async () => {
  const { admin, log } = load()
  const res = await admin.saveWineLabel(25, jpeg(), '25/1-old.jpg')
  assert.equal(res.ok, true)
  assert.match(res.path, PATH_OK)
  assert.ok(res.path.startsWith('25/'))
  assert.deepEqual(log.map(x => x[0]), ['upload', 'update', 'remove'])
  assert.deepEqual(log[0].slice(1, 3), ['wine-labels', res.path])
  assert.equal(log[0][3], 'image/jpeg')
  assert.equal(log[0][4], false, 'nooit een bestaand bestand overschrijven')
  assert.deepEqual(log[1], ['update', 'wines', { label_path: res.path }, 'item_id', 25])
  assert.deepEqual(log[2], ['remove', 'wine-labels', '25/1-old.jpg'])
})

test('without an old label nothing is removed, and every upload gets its own path', async () => {
  const { admin, log } = load()
  const a = await admin.saveWineLabel(7, jpeg())
  const b = await admin.saveWineLabel(7, jpeg())
  assert.equal(a.ok && b.ok, true)
  assert.notEqual(a.path, b.path)
  assert.equal(log.filter(x => x[0] === 'remove').length, 0)
})

test('PNG and WebP keep their extension and still match the database check', async () => {
  const { admin } = load()
  for (const [type, ext] of [['image/png', 'png'], ['image/webp', 'webp']]) {
    const res = await admin.saveWineLabel(3, new Blob([new Uint8Array(10)], { type }))
    assert.equal(res.ok, true)
    assert.match(res.path, PATH_OK)
    assert.ok(res.path.endsWith('.' + ext))
  }
})

test('when the path cannot be set, the uploaded file is removed again and the old one stays', async () => {
  const { admin, log } = load({ update: { data: null, error: { code: '42501', message: 'rls' } } })
  const res = await admin.saveWineLabel(25, jpeg(), '25/1-old.jpg')
  assert.equal(res.ok, false)
  assert.equal(res.relogin, true)
  const removes = log.filter(x => x[0] === 'remove')
  assert.equal(removes.length, 1)
  assert.equal(removes[0][2], log[0][2], 'het net geüploade bestand')
  assert.notEqual(removes[0][2], '25/1-old.jpg')
})

test('a database without migration 0029 says so (missing column), and nothing is left in the bucket', async () => {
  const { admin, log } = load({ update: { data: null, error: { code: 'PGRST204', message: "Could not find the 'label_path' column of 'wines'" } } })
  const res = await admin.saveWineLabel(25, jpeg())
  assert.equal(res.ok, false)
  assert.equal(res.missing, true)
  assert.match(res.message, /0029/)
  assert.equal(log.filter(x => x[0] === 'remove').length, 1)
})

test('a missing bucket also points to migration 0029', async () => {
  const { admin, log } = load({ uploadError: { statusCode: '404', message: 'Bucket not found' } })
  const res = await admin.saveWineLabel(25, jpeg())
  assert.equal(res.ok, false)
  assert.equal(res.missing, true)
  assert.deepEqual(log.map(x => x[0]), ['upload'])
})

test('no rights on the bucket: ask to log in again', async () => {
  const { admin } = load({ uploadError: { statusCode: '403', message: 'new row violates row-level security policy' } })
  const res = await admin.saveWineLabel(25, jpeg())
  assert.equal(res.ok, false)
  assert.equal(res.relogin, true)
})

test('refuses what the bucket would refuse, before uploading anything', async () => {
  const { admin, log } = load()
  assert.equal((await admin.saveWineLabel(25, new Blob(['x'], { type: 'application/pdf' }))).ok, false)
  assert.equal((await admin.saveWineLabel(25, new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/jpeg' }))).ok, false)
  assert.equal((await admin.saveWineLabel(25, null)).ok, false)
  assert.equal((await admin.saveWineLabel(null, jpeg())).ok, false)
  assert.equal(log.length, 0)
})

test('a photo from Scan foto is fetched from bottle-scans and stored in wine-labels', async () => {
  const { admin, log } = load()
  const res = await admin.saveWineLabelFromScan(25, '2026-11-07/1794-abc.jpg', null)
  assert.equal(res.ok, true)
  assert.deepEqual(log.map(x => x[0]), ['download', 'upload', 'update'])
  assert.deepEqual(log[0], ['download', 'bottle-scans', '2026-11-07/1794-abc.jpg'])
  assert.equal(log[1][1], 'wine-labels')
  assert.equal(log.some(x => x[0] === 'remove' && x[1] === 'bottle-scans'), false, 'het origineel blijft staan')
})

test('a scan photo that cannot be fetched stops before anything is written', async () => {
  const { admin, log } = load({ download: { data: null, error: { statusCode: '404', message: 'Object not found' } } })
  const res = await admin.saveWineLabelFromScan(25, 'gone.jpg', null)
  assert.equal(res.ok, false)
  assert.deepEqual(log.map(x => x[0]), ['download'])
  assert.equal((await admin.saveWineLabelFromScan(25, '', null)).ok, false)
})

test('removing a label clears the path first, then deletes the file', async () => {
  const { admin, log } = load()
  const res = await admin.clearWineLabel(25, '25/1-old.jpg')
  assert.equal(res.ok, true)
  assert.deepEqual(log, [['update', 'wines', { label_path: null }, 'item_id', 25], ['remove', 'wine-labels', '25/1-old.jpg']])
})

test('a file that cannot be removed does not make saving fail', async () => {
  const { admin } = load({ removeError: { message: 'nope' } })
  const res = await admin.saveWineLabel(25, jpeg(), '25/1-old.jpg')
  assert.equal(res.ok, true)
  assert.equal(await admin.removeLabelFile('25/1-old.jpg'), false)
})
