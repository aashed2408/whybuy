/**
 * Split a model response into "reasoning" (text inside `<think>...</think>`
 * blocks, with the tags stripped) and "body" (everything else).
 *
 * Supports multiple think blocks (some models emit several short ones
 * instead of one long one) and tolerates:
 *   - leading whitespace before the first think block
 *   - missing closing tag (unclosed block is treated as reasoning)
 *   - a body that has no think block at all (reasoning = "")
 *   - prose after the last think block (kept in body)
 *
 * Lives in its own file so the unit tests (which use Node's
 * experimental-strip-types loader without the WXT path-alias resolution)
 * can import it without dragging in the rest of `byok.ts`.
 */
export function splitThinkBlocks(raw: string): { reasoning: string; body: string } {
  if (!raw) return { reasoning: '', body: '' }
  const text = raw
  const re = /<think>([\s\S]*?)(?:<\/think>|$)/gi
  const reasoningParts: string[] = []
  let body = text
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const inside = (match[1] || '').trim()
    if (inside) reasoningParts.push(inside)
  }
  // Strip think blocks (and any unclosed tail) from the body.
  body = body.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '').trim()
  return {
    reasoning: reasoningParts.filter(Boolean).join('\n\n').trim(),
    body,
  }
}
