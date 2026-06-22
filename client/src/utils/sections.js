// Canonical section order — Warm Up always first, Cool Down/Stretching last
const SECTION_ORDER = ['Warm Up', 'Workout', 'Cardio', 'Cool Down', 'Stretching'];

function sectionRank(name) {
  const idx = SECTION_ORDER.findIndex(s => s.toLowerCase() === (name || 'workout').toLowerCase());
  return idx === -1 ? 1 : idx; // unknown sections slot after Workout
}

export function groupBySection(exercises) {
  const map = {};
  for (const ex of (exercises || [])) {
    const s = ex.section || 'Workout';
    if (!map[s]) map[s] = [];
    map[s].push(ex);
  }
  return Object.keys(map)
    .sort((a, b) => sectionRank(a) - sectionRank(b))
    .map(s => ({ section: s, exercises: map[s] }));
}
