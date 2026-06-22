const express = require('express');
const router = express.Router();
const multer = require('multer');
const OpenAI = require('openai');
const db = require('../db');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }
  return new OpenAI({ apiKey });
}

// POST /api/plans/import/image
// Accepts an image, uses GPT-4o vision to extract workout plan data.
// Returns a preview (does NOT save) so the user can review before confirming.
router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  let client;
  try {
    client = getClient();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const base64 = req.file.buffer.toString('base64');
  const mimeType = req.file.mimetype || 'image/jpeg';

  const prompt = `You are a fitness assistant. Analyze this workout plan image and extract all the information into structured JSON.

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "plans": [
    {
      "name": "Plan name (e.g. Push Day, Chest Day, Workout A)",
      "description": "Brief description if visible, otherwise empty string",
      "exercises": [
        {
          "name": "Exercise name",
          "notes": "Any sets/reps/notes visible for this exercise, or empty string"
        }
      ]
    }
  ]
}

Rules:
- If the image shows multiple distinct workout plans/days, include each as a separate plan object.
- If it's one workout, return one plan.
- Include every exercise you can see.
- For notes, include things like "3x10", "4 sets of 8-12 reps", "to failure", etc.
- If you cannot read the image or it doesn't contain a workout plan, return: {"error": "Could not extract workout plan from image"}
- Do NOT include any text outside the JSON.`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: 'high',
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) return res.status(500).json({ error: 'No response from AI' });

    // Strip markdown code fences if the model wrapped in them
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: 'AI returned invalid JSON', raw });
    }

    if (parsed.error) {
      return res.status(422).json({ error: parsed.error });
    }

    if (!parsed.plans || !Array.isArray(parsed.plans)) {
      return res.status(422).json({ error: 'Could not extract plans from image' });
    }

    res.json({ plans: parsed.plans });
  } catch (err) {
    const msg = err?.error?.message || err.message || 'Unknown error';
    res.status(500).json({ error: 'OpenAI API error: ' + msg });
  }
});

// POST /api/plans/import/image/save
// Saves the confirmed (possibly edited) plans from the preview.
router.post('/save', (req, res) => {
  const { plans } = req.body;
  if (!plans || !Array.isArray(plans) || plans.length === 0) {
    return res.status(400).json({ error: 'No plans provided' });
  }

  const saved = [];
  const saveAll = db.transaction(() => {
    for (const plan of plans) {
      if (!plan.name?.trim()) continue;

      const result = db.prepare(
        'INSERT INTO workout_plans (name, description) VALUES (?, ?)'
      ).run(plan.name.trim(), plan.description?.trim() || null);

      const planId = result.lastInsertRowid;

      if (plan.exercises?.length > 0) {
        const insertEx = db.prepare(
          'INSERT INTO exercises (plan_id, name, order_index, notes) VALUES (?, ?, ?, ?)'
        );
        plan.exercises.forEach((ex, i) => {
          if (ex.name?.trim()) {
            insertEx.run(planId, ex.name.trim(), i, ex.notes?.trim() || null);
          }
        });
      }

      saved.push({ id: planId, name: plan.name, exercise_count: plan.exercises?.length || 0 });
    }
  });

  saveAll();
  res.status(201).json({ saved: saved.length, plans: saved });
});

module.exports = router;
