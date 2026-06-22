# ShribeTRAKR

A personal gym workout tracker. Create workout plans from your spreadsheets, build a weekly schedule, and log every set, rep, and weight as you train.

## Features

- **Workout Plans** — Create plans manually or import from a CSV spreadsheet. Each plan has a list of exercises with optional notes.
- **Schedule** — Calendar view to assign workout plans to specific days of the month.
- **Workout Logger** — Start today's scheduled workout, expand each exercise, and quickly log sets with reps and weight (lbs or kg).
- **History** — Review all past sessions with a full breakdown of sets logged per exercise.

## Getting Started

### Requirements

- Node.js 18+

### Install dependencies

```bash
npm install
npm --prefix server install
npm --prefix client install
```

### Run in development

```bash
npm run dev
```

- Server: http://localhost:3001
- Client (Vite): http://localhost:5173

### Production build

```bash
npm run build   # builds client into client/dist
npm start       # serves API + built client on port 3001
```

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

- **Backend**: Node.js + Express + SQLite (via better-sqlite3)
- **Frontend**: React + Vite + TailwindCSS
- **Data**: File-based SQLite stored in `server/data/gym.db`
