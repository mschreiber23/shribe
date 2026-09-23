# ShribeTRAKR

A personal gym workout tracker. Create workout plans from your spreadsheets, build a weekly schedule, and log every set, rep, and weight as you train.

## Features

- **Workout Plans** — Create plans manually or import from a CSV spreadsheet. Each plan has a list of exercises with optional notes.
- **Schedule** — Calendar view to assign workout plans to specific days of the month.
- **Workout Logger** — Start today's scheduled workout, expand each exercise, and quickly log sets with reps and weight (lbs or kg).
- **History** — Review all past sessions with a full breakdown of sets logged per exercise.

## Getting Started

### Requirements

- Node.js 22+

### Install and run the site locally

The live site is a static app, same as the sports dashboard. Data lives in Supabase, so you only need the client:

```bash
npm --prefix client install
npm --prefix client run dev
```

Open http://localhost:5173.

The first time, run `supabase/setup.sql` in the Supabase SQL editor (the same project the sports app uses).

## Deployment

This matches the sports app: GitHub Actions builds the Vite app and publishes it to GitHub Pages.

- Workflow: `.github/workflows/deploy.yml`
- Custom domain file: `client/public/CNAME` (`shribetrakr.com`)
- A push to `main` builds `client/` and updates the `gh-pages` branch

Point the domain at GitHub Pages, then Railway can be removed:

- `A` records for `shribetrakr.com`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- `CNAME` for `www` → `mschreiber23.github.io`

Whoop and photo import run as Supabase Edge Functions (`supabase/functions`). They need `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, and `OPENAI_API_KEY` set in the Supabase project. In the Whoop app, set the redirect URL to `https://shribetrakr.com/whoop/callback`.

## CSV Import Format

Export your spreadsheet as a CSV with these columns:

| Column | Required | Description |
|---|---|---|
| `plan_name` | ✓ | Name of the workout plan |
| `exercise_name` | ✓ | Name of the exercise |
| `notes` | | Optional notes for the exercise |
| `plan_description` | | Optional description for the plan |

Each row is one exercise. Rows with the same `plan_name` are grouped into the same plan.

**Example:**

```csv
plan_name,exercise_name,notes,plan_description
Push Day,Bench Press,3x5,Chest shoulders triceps
Push Day,Overhead Press,,
Push Day,Tricep Pushdown,3x12,
Pull Day,Pull-ups,,Back and biceps
Pull Day,Barbell Row,3x8,
```

## Tech Stack

- **Frontend**: React + Vite + TailwindCSS, hosted on GitHub Pages
- **Data and login**: Supabase (same project as the sports app)
- **Whoop and photo import**: Supabase Edge Functions, so those API secrets stay off the website
