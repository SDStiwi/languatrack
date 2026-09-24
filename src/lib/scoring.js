export const LEVELS = ["A1", "A2", "B1", "B2", "C1"];

// A level counts as "passed" when the student answers at least this share of
// that level's own questions correctly...
export const LEVEL_PASS_RATE = 0.65;
// ...and at least this share of ALL questions up to and including that level.
// This forgives one careless slip at a lower level, but stops a scattered
// answer pattern from reaching a high level.
export const CUMULATIVE_PASS_RATE = 0.7;

function tally(map, key, isCorrect) {
  const entry = (map[key] ||= { correct: 0, total: 0 });
  entry.total += 1;
  if (isCorrect) entry.correct += 1;
}

const pct = ({ correct, total }) => Math.round((correct / total) * 100);

/**
 * Score an assessment.
 * `questions` must be the exact list the student saw (options may be shuffled),
 * and `answers` maps question id -> index of the option the student chose.
 */
export function calculateResult(questions, answers) {
  const total = questions.length;
  const skillStats = {};
  const levelStats = {};
  let correct = 0;

  for (const q of questions) {
    const ok = answers[q.id] === q.answer;
    if (ok) correct += 1;
    tally(skillStats, q.skill, ok);
    tally(levelStats, q.level, ok);
  }

  const percentage = total ? Math.round((correct / total) * 100) : 0;

  const skills = Object.fromEntries(Object.entries(skillStats).map(([name, s]) => [name, pct(s)]));
  const levels = LEVELS.filter(l => levelStats[l]).map(l => ({
    level: l,
    ...levelStats[l],
    percentage: pct(levelStats[l])
  }));

  // Estimated level: the highest level that was passed on its own AND with a
  // healthy overall score up to that point. Never higher than what was tested,
  // and never lower than A1 (the lowest level this tool reports).
  let level = "A1";
  let runCorrect = 0;
  let runTotal = 0;
  for (const l of levels) {
    runCorrect += l.correct;
    runTotal += l.total;
    if (l.correct / l.total >= LEVEL_PASS_RATE && runCorrect / runTotal >= CUMULATIVE_PASS_RATE) {
      level = l.level;
    }
  }
  const topLevel = levels.length ? levels[levels.length - 1].level : "A1";
  const ceiling = levels.length > 0 && level === topLevel;

  // Strongest / weakest skills. If every skill scored the same there is no
  // meaningful difference, so report neither (null) instead of picking one.
  const values = Object.values(skills);
  const max = values.length ? Math.max(...values) : 0;
  const min = values.length ? Math.min(...values) : 0;
  const namesAt = v => Object.keys(skills).filter(k => skills[k] === v).join(" & ");
  const balanced = values.length < 2 || max === min;

  return {
    correct,
    total,
    percentage,
    level,
    levels,
    topLevel,
    ceiling,
    skills,
    skillDetail: skillStats,
    strongest: balanced ? null : namesAt(max),
    weakest: balanced ? null : namesAt(min)
  };
}
