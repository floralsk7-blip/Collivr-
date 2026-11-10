// Decides whether an AI call may run, and what to do when it can't. Pure TypeScript
// (no Deno, no network) so it is unit-tested with plain Node.
//
// The rule: AI is the core of COLLIVRA, but it must never break the product. If the monthly
// plan limit is used up, or the AI service is busy, the same screen still works with the
// built-in rules, and the user is told why.

export type AiOutcome<T> = { value: T; source: 'ai' | 'rules'; notice?: string; code?: string }

export async function gateAi<T>(opts: {
  tier: string
  used: number
  limit: number
  premiumLimit: number
  call: () => Promise<T>
  fallback: () => T | Promise<T>
  record: () => Promise<void>
}): Promise<AiOutcome<T>> {
  if (opts.used >= opts.limit) {
    return {
      value: await opts.fallback(),
      source: 'rules',
      code: 'quota_reached',
      notice:
        opts.tier === 'free'
          ? `You have used all ${opts.limit} free AI actions this month, so this result uses the built-in rules. Upgrade to Premium for ${opts.premiumLimit} a month.`
          : `You have reached this month's limit of ${opts.limit} AI actions, so this result uses the built-in rules.`,
    }
  }
  try {
    const value = await opts.call()
    try {
      await opts.record()
    } catch (err) {
      // A usage-counter hiccup must not throw away a good AI answer.
      console.error('Could not record AI usage:', err)
    }
    return { value, source: 'ai' }
  } catch (err) {
    console.error('AI call failed, using built-in rules:', err)
    return {
      value: await opts.fallback(),
      source: 'rules',
      code: 'ai_unavailable',
      notice: 'The AI service is busy right now, so this result uses the built-in rules. Try again in a moment.',
    }
  }
}

export async function hashJson(value: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(value))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
