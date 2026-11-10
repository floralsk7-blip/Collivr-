// Small Gemini helper shared by edge functions.
// Set GEMINI_MODEL as a function secret to change the model without a redeploy of code.
const DEFAULT_MODEL = 'gemini-3.5-flash-lite'

export async function callGeminiJson<T>(prompt: string): Promise<T> {
  const model = Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': Deno.env.get('GEMINI_API_KEY') ?? '',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    },
  )
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error?.message || `Gemini request failed with status ${res.status}`)
  }
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return JSON.parse(raw.replace(/```json|```/g, '').trim()) as T
}

// Raw call used by the tool-calling agent. Returns the first candidate's content untouched
// so function-call turns can be echoed back to the model exactly as received.
export async function callGeminiAgent(body: Record<string, unknown>) {
  const model = Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': Deno.env.get('GEMINI_API_KEY') ?? '',
      },
      body: JSON.stringify(body),
    },
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error?.message || `Gemini request failed with status ${res.status}`)
  return data?.candidates?.[0]?.content ?? null
}
