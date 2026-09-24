# LinguaTrack

English level assessment and progress-tracking web app for private English teaching.

## MVP

- Tablet-friendly student assessments
- Short initial English level assessment (maximum 15 questions)
- Estimated CEFR-style level (A1–B2 in the current short assessment)
- Grammar, vocabulary, reading and everyday-English skill breakdown
- Student records
- Progress-test foundation
- Supabase database schema
- Vercel-ready React/Vite project

## Important

The assessment gives an **estimated level** for teaching support. It is not an official CEFR certification.

### Question design
The short assessments use original questions written around CEFR-style task types and learner abilities described by the British Council LearnEnglish level framework and Cambridge English preparation resources. The wording is intentionally short and familiar for learners who do not speak English as their first language. Questions are not copied from those tests.

## Age modes: kids, teens, adults

Each student's age group (Kids / Teens / Adults) picks the mode automatically. There is nothing to switch during a session.

| Mode | Initial assessment | Progress test | What changes |
| --- | --- | --- | --- |
| Kids | 15 questions, A1–B1 | 10 questions | Picture-friendly wording, big rounded buttons, friendly skill names, neutral encouragement, star rating on the results screen |
| Teens | 15 questions, A1–B2 | 10 questions | School, friends and phone situations, bold purple theme, level label hidden during the test |
| Adults | 15 questions, A1–B2 | 10 questions | Work and everyday English, the original calm green theme |

Question banks live in `src/data/` (`kids.js`, `teens.js`, `questions.js` for adults) and are chosen in `src/data/banks.js`. Mode colours, wording and timings are in `src/lib/modes.js` and the `.mode-*` rules in `src/index.css`. Initial assessments are capped at 15 questions. Kids measure up to B1; teens and adults measure up to B2. The results page warns when the student reaches the highest level included in the test.

Saved assessments include the mode in their title (for example "Initial Level Assessment · Kids"). No database change is needed: `students.age_group` already stores Child, Teen or Adult.

## How the level is estimated

Each question is tagged with a CEFR-style level (A1–C1). A level counts as **passed** when the student answers at least 65% of that level's questions correctly **and** at least 70% of all questions up to that level. The estimated level is the highest level passed (minimum A1).

- The estimate never goes above the highest level the test contains. The 10-question progress test tops out at B2, and the results page says so when every level was passed.
- Answer options are shuffled for every sitting, and questions run from easiest to hardest.
- With only a few questions per level, especially in the progress test, treat the result as a guide and look at the per-level breakdown.

## Saving results

- With Supabase configured, results are saved to `assessments` and `assessment_answers`, and the student list shows each student's latest level and score.
- If a save fails (offline, Supabase down), the result is kept in the browser and re-sent automatically on the next load, when the connection returns, or via **Sync now**.
- Without Supabase the app runs in demo mode with sample students and nothing is stored.

## Run locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and add your Supabase project URL and publishable/anon key.

## Supabase

Run `supabase/schema.sql` in the Supabase SQL Editor.

The current MVP policies are intentionally broad to make the first deployment quick. Before using real student data beyond a small controlled setup, add teacher authentication and restrict every table to authenticated teacher users.

## Deploy

Push to GitHub and import the repository into Vercel.

Add these Vercel environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Do not put a Supabase service-role key in the frontend.


### Student profiles
Click a student name or **View profile** from the Students page to open a dedicated profile. Each profile keeps the latest result, full assessment history, and teacher assessment notes. Notes are stored in `students.notes` in Supabase.
