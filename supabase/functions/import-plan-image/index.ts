const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PROMPT = `You are a fitness assistant. Analyze this workout plan image and extract all the information into structured JSON.

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "plans": [
    {
      "name": "Plan name (e.g. Push Day, Chest Day, Workout A)",
      "description": "Brief description if visible, otherwise empty string",
      "exercises": [
        {
          "name": "Exercise name",
          "section": "Section name (e.g. Warm Up, Workout, Cool Down, Cardio) — use exactly what the plan shows",
          "notes": "Sets x reps or any notes visible for this exercise, or empty string"
        }
      ]
    }
  ]
}

Rules:
- If the image shows multiple distinct workout plans/days, include each as a separate plan object.
- If it's one workout, return one plan.
- Include every exercise you can see.
- For the "section" field: if the plan has labeled sections (e.g. "Warm Up", "Workout", "Cool Down"), use those exact labels. If there are no sections, use "Workout" for all exercises.
- For notes, include sets/reps info like "3x10", "2-3 sets, 5 each side", "15-20 reps", etc.
- If you cannot read the image or it doesn't contain a workout plan, return: {"error": "Could not extract workout plan from image"}
- Do NOT include any text outside the JSON.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return json({ error: 'Photo import is not set up yet. Add the workout plan by hand, or add OPENAI_API_KEY in Supabase.' }, 500);

  const form = await req.formData();
  const file = form.get('image');
  if (!(file instanceof File)) return json({ error: 'No image uploaded' }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = btoa(binary);
  const mimeType = file.type || 'image/jpeg';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}`, detail: 'high' } },
          { type: 'text', text: PROMPT },
        ],
      }],
    }),
  });
  const body = await res.json();
  if (!res.ok) return json({ error: 'OpenAI API error: ' + (body.error?.message || res.statusText) }, 500);
  const raw = body.choices?.[0]?.message?.content?.trim();
  if (!raw) return json({ error: 'No response from AI' }, 500);
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed.error) return json({ error: parsed.error }, 422);
    if (!parsed.plans) return json({ error: 'Could not extract plans from image' }, 422);
    return json({ plans: parsed.plans });
  } catch {
    return json({ error: 'AI returned invalid JSON' }, 500);
  }
});
