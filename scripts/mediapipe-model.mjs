#!/usr/bin/env node
/**
 * npm run mediapipe:model — PREPARACIÓN INICIAL para usar MediaPipe sin conexión.
 *
 * El runtime WASM ya se sirve desde node_modules (lo instala `npm install`);
 * solo falta el modelo de Face Landmarker (~3,8 MB, no se versiona). Este
 * script lo deja en apps/onboard/mediapipe-models/ y verifica su SHA-256 fijado.
 *
 *   npm run mediapipe:model                         descarga (requiere red UNA vez)
 *   npm run mediapipe:model -- --from ruta.task     instala una copia obtenida por otro medio
 *   npm run mediapipe:model -- --force              vuelve a descargar aunque ya exista
 *
 * Después, reinicia Onboard (dev o build) para que lo sirva.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
/** Huella del modelo float16/1 (versión publicada e inmutable): garantiza que todas las instalaciones usan el mismo. */
export const MODEL_SHA256 = '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'
const DIR = path.join(ROOT, 'apps/onboard/mediapipe-models')
const FILE = path.join(DIR, 'face_landmarker.task')
const ATTEMPTS = 3

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')
const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}
const fail = (message) => {
  console.error(`✘ ${message}`)
  process.exit(1)
}

/** Un .task es un ZIP (PK\x03\x04 al principio, a veces tras unos bytes de relleno). */
function check(buffer, origin) {
  if (buffer.length < 1_000_000 || buffer.subarray(0, 64).indexOf('PK\x03\x04') < 0) {
    fail(`${origin}: no parece un modelo .task (${buffer.length} bytes)`)
  }
  const hash = sha256(buffer)
  if (hash !== MODEL_SHA256) fail(`${origin}: SHA-256 inesperado (${hash}); se esperaba ${MODEL_SHA256}`)
}

async function download() {
  let lastError
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      console.log(`Descargando ${MODEL_URL} (intento ${attempt}/${ATTEMPTS})…`)
      const response = await fetch(MODEL_URL, { signal: AbortSignal.timeout(120_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      lastError = error
      console.error(`  ⚠ ${error.cause?.code ?? error.name}: ${error.cause?.message ?? error.message}`)
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
  fail(
    `No se pudo descargar el modelo (${lastError?.cause?.code ?? lastError?.message}). Comprueba la conexión o descárgalo en otro equipo desde\n  ${MODEL_URL}\n  e instálalo con: npm run mediapipe:model -- --from <ruta del archivo>`,
  )
}

const from = arg('--from')
if (existsSync(FILE) && !from && !process.argv.includes('--force')) {
  const current = readFileSync(FILE)
  const hash = sha256(current)
  console.log(`Ya existe ${path.relative(ROOT, FILE)} · sha256 ${hash} ${hash === MODEL_SHA256 ? '(verificado)' : '(¡NO coincide! usa --force)'}`)
  process.exit(hash === MODEL_SHA256 ? 0 : 1)
}

let buffer
if (from) {
  if (!existsSync(from)) fail(`No existe ${from}`)
  buffer = readFileSync(from)
  check(buffer, from)
} else {
  buffer = await download()
  check(buffer, 'Descarga')
}
mkdirSync(DIR, { recursive: true })
writeFileSync(`${FILE}.tmp`, buffer)
renameSync(`${FILE}.tmp`, FILE)
console.log(`✔ ${path.relative(ROOT, FILE)} · ${(buffer.length / 1e6).toFixed(2)} MB · sha256 verificado`)
console.log('Reinicia Onboard (npm run dev o build) para servir el modelo localmente: a partir de aquí MediaPipe funciona sin conexión.')
