// Shared test-isolation helpers for the puppeteer e2e scripts.
//
// Each e2e script launches a fresh puppeteer Chrome and writes a
// BYOK config into `chrome.storage.local`. If the test accidentally
// runs against the user's real Chrome profile, the BYOK key (or the
// cooldowns / history the script generates) would land in the user's
// real state.
//
// `assertIsolatedProfile(userDataDir)` enforces that the script's
// Chrome data dir is a tempdir. It runs before puppeteer launches so
// a misuse fails fast with a clear error rather than silently
// polluting the user's profile.

import { resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'

const REAL_PROFILE_ENV = 'WHYBUY_ALLOW_REAL_PROFILE'

/**
 * True when `userDataDir` lives under `os.tmpdir()`. Returns false
 * for empty / null input.
 */
export function isTempProfile(userDataDir) {
  if (!userDataDir) return false
  const abs = resolve(userDataDir)
  const tmp = resolve(tmpdir())
  return abs === tmp || abs.startsWith(tmp + sep)
}

/**
 * Hard-fail if the script was launched with a non-temp profile.
 * Returns silently when the profile is a tempdir or the override
 * env var is set. Exits the process with a clear error otherwise.
 *
 * The exit code is 2 so it can be distinguished from a test failure
 * (1) in CI.
 */
export function assertIsolatedProfile(userDataDir) {
  if (isTempProfile(userDataDir)) return
  if (process.env[REAL_PROFILE_ENV] === '1') {
    console.warn(`⚠ WHYBUY_ALLOW_REAL_PROFILE=1 set: using non-temp profile ${userDataDir}`)
    return
  }
  console.error('✘ Refusing to use a non-temp Chrome profile for tests.')
  console.error(`  userDataDir: ${userDataDir}`)
  console.error('  Tests must run in an isolated tempdir so they never')
  console.error("  touch the user's real Chrome storage state.")
  console.error('')
  console.error('  Fix:')
  console.error("    - Use `mkdtempSync(join(tmpdir(), 'whybuy-...'))` for userDataDir.")
  console.error(`    - Or set ${REAL_PROFILE_ENV}=1 to override.`)
  process.exit(2)
}

/**
 * Standard test-isolation log line. Helps audit the test scripts by
 * making the profile they use visible in the test output.
 */
export function logIsolatedProfile(label, userDataDir) {
  console.log(`[${label}] isolated profile: ${userDataDir}`)
}
