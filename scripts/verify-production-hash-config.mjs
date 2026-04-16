import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEPLOY_ENV_PATH = resolve(process.cwd(), 'infra/compose/deploy.env')

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return new Map()
  }

  const content = readFileSync(filePath, 'utf8')
  const entries = new Map()

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    entries.set(key, value)
  }

  return entries
}

function resolveEnvValue(key, envFileEntries) {
  const processValue = process.env[key]
  if (typeof processValue === 'string' && processValue.trim().length > 0) {
    return processValue.trim()
  }

  const fileValue = envFileEntries.get(key)
  if (typeof fileValue === 'string' && fileValue.trim().length > 0) {
    return fileValue.trim()
  }

  return ''
}

function fail(message) {
  console.error(`❌ Production deploy gate failed: ${message}`)
  process.exit(1)
}

const envFileEntries = parseEnvFile(DEPLOY_ENV_PATH)

const nodeEnv = resolveEnvValue('NODE_ENV', envFileEntries)
const hashEnv = resolveEnvValue('HASH_ENV', envFileEntries)
const hashApiUrl = resolveEnvValue('HASH_API_URL', envFileEntries)
const hashApiKey = resolveEnvValue('HASH_API_KEY', envFileEntries)
const hashProdApiUrl = resolveEnvValue('HASH_PROD_API_URL', envFileEntries)
const hashProdApiKey = resolveEnvValue('HASH_PROD_API_KEY', envFileEntries)
const hashTestApiUrl = resolveEnvValue('HASH_TEST_API_URL', envFileEntries)
const hashTestApiKey = resolveEnvValue('HASH_TEST_API_KEY', envFileEntries)

const effectiveApiUrl = hashApiUrl || hashProdApiUrl
const effectiveApiKey = hashApiKey || hashProdApiKey

if (nodeEnv !== 'production') {
  fail(`NODE_ENV must be "production" (received "${nodeEnv || '<empty>'}").`)
}

if (hashEnv !== 'production') {
  fail(`HASH_ENV must be "production" (received "${hashEnv || '<empty>'}").`)
}

if (!effectiveApiUrl) {
  fail('Missing effective production Hash API URL (set HASH_API_URL or HASH_PROD_API_URL).')
}

if (!effectiveApiKey) {
  fail('Missing effective production Hash API key (set HASH_API_KEY or HASH_PROD_API_KEY).')
}

if (hashTestApiUrl && effectiveApiUrl === hashTestApiUrl) {
  fail('Effective Hash API URL resolves to HASH_TEST_API_URL.')
}

if (hashTestApiKey && effectiveApiKey === hashTestApiKey) {
  fail('Effective Hash API key resolves to HASH_TEST_API_KEY.')
}

if (/\b(test|staging|sandbox|qa)\b/i.test(effectiveApiUrl)) {
  fail(`Effective Hash API URL looks non-production: "${effectiveApiUrl}".`)
}

console.log('✅ Production deploy gate passed: Hashavshevet environment is production-safe.')
