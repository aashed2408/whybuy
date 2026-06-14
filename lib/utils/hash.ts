/**
 * Stable, short, non-cryptographic hash for product fingerprinting.
 *
 * Used only to key local cooldown storage. Not security-sensitive.
 */
export function shortHash(input: string): string {
  // FNV-1a, 32-bit.
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
