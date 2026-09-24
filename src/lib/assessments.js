import { LEVELS } from "./scoring";

const LEVEL_ORDER = Object.fromEntries(LEVELS.map((l, i) => [l, i]));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only students that exist in Supabase (real UUIDs) can have results saved. */
export const isPersistedStudent = student => UUID_RE.test(String(student?.id ?? ""));

export function shuffle(items, rng = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Get a question bank ready for one sitting:
 *  - questions run from easiest to hardest level,
 *  - answer options are shuffled so the correct answer isn't always in the same
 *    slot (in the raw data over half of the answers are option B).
 * `answer` is recalculated for the shuffled options, and `order[k]` remembers
 * which ORIGINAL option is now shown in slot k (used when saving answers).
 */
export function prepareQuestions(bank, rng = Math.random) {
  return [...bank]
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
    .map(q => {
      const order = shuffle(q.options.map((_, i) => i), rng);
      return {
        ...q,
        options: order.map(i => q.options[i]),
        answer: order.indexOf(q.answer),
        order
      };
    });
}

/** Turn student rows (with their embedded assessments) into what the UI shows. */
export function summarizeStudent(row) {
  const done = [...(row.assessments || [])].sort(
    (a, b) => new Date(b.completed_at) - new Date(a.completed_at)
  );
  const latest = done[0];
  return {
    ...row,
    level: latest?.estimated_level || "—",
    score: latest ? latest.score : null,
    tests: done.length
  };
}

/** Everything needed to save (or later re-send) one finished assessment. */
export function buildEntry({ student, type, questions, answers, result, startedAt, modeLabel }) {
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    assessment: {
      student_id: student.id,
      type,
      title: (type === "initial" ? "Initial Level Assessment" : "Progress Test") + (modeLabel ? ` · ${modeLabel}` : ""),
      score: result.percentage,
      estimated_level: result.level,
      started_at: startedAt,
      completed_at: new Date().toISOString()
    },
    answers: questions.map(q => ({
      question_id: String(q.id),
      // store the index in the ORIGINAL option order, not the shuffled one
      selected_answer: answers[q.id] === undefined ? null : q.order[answers[q.id]],
      is_correct: answers[q.id] === q.answer
    }))
  };
}

/**
 * Save an entry to Supabase in two steps (assessment, then its answers).
 * Never throws. On failure it returns the entry with `assessmentId` filled in
 * if step 1 already succeeded, so a retry doesn't create a duplicate assessment.
 */
export async function saveAssessment(client, entry) {
  const work = { ...entry };
  try {
    if (!work.assessmentId) {
      const { data, error } = await client.from("assessments").insert(work.assessment).select().single();
      if (error) throw error;
      work.assessmentId = data.id;
    }
    const rows = work.answers.map(a => ({ ...a, assessment_id: work.assessmentId }));
    const { error } = await client.from("assessment_answers").insert(rows);
    if (error) throw error;
    return { ok: true, entry: work };
  } catch (error) {
    return { ok: false, error, entry: work };
  }
}
