import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3, BookOpen, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList,
  GraduationCap, LayoutDashboard, Plus, RefreshCw, Search, Users
} from "lucide-react";
import { getBank } from "./data/banks";
import { AGE_GROUPS, MODES, modeOf, starsFor } from "./lib/modes";
import { LEVELS, calculateResult } from "./lib/scoring";
import { buildEntry, isPersistedStudent, prepareQuestions, saveAssessment, summarizeStudent } from "./lib/assessments";
import {
  addPendingAssessment, getPendingAssessments, removePendingAssessment, updatePendingAssessment
} from "./lib/storage";
import { supabase } from "./lib/supabase";

// Sample data, used only when Supabase is not configured.
const demoStudents = [
  {
    id: "demo-1", name: "Sarah", age_group: "Adult", level: "A2", score: 61, tests: 1,
    notes: "Review everyday conversation and past tense. Keep instructions short and give one example when introducing a new task.",
    assessments: [{ id: "demo-a1", title: "Initial Level Assessment · Adults", type: "initial", score: 61, estimated_level: "A2", completed_at: "2026-09-18T10:00:00Z" }]
  },
  {
    id: "demo-2", name: "Ahmed", age_group: "Teen", level: "B1", score: 74, tests: 2,
    notes: "Good understanding of familiar topics. Practise speaking fluency and polite discussion phrases.",
    assessments: [
      { id: "demo-a2", title: "Progress Test · Teens", type: "progress", score: 74, estimated_level: "B1", completed_at: "2026-09-22T10:00:00Z" },
      { id: "demo-a3", title: "Initial Level Assessment · Teens", type: "initial", score: 68, estimated_level: "B1", completed_at: "2026-09-10T10:00:00Z" }
    ]
  },
  {
    id: "demo-3", name: "Lina", age_group: "Child", level: "A1", score: 48, tests: 1,
    notes: "Build confidence with simple everyday vocabulary and short questions.",
    assessments: [{ id: "demo-a4", title: "Initial Level Assessment · Kids", type: "initial", score: 48, estimated_level: "A1", completed_at: "2026-09-20T10:00:00Z" }]
  }
];

function App() {
  const [page, setPage] = useState("dashboard");
  const [session, setSession] = useState(null); // { student, type, questions, startedAt }
  const [result, setResult] = useState(null);
  const [students, setStudents] = useState(supabase ? [] : demoStudents);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [online, setOnline] = useState(false);
  const [pendingCount, setPendingCount] = useState(() => getPendingAssessments().length);
  const [syncing, setSyncing] = useState(false);
  const [studentFilter, setStudentFilter] = useState("all"); // "all" or an age group
  const [profileStudentId, setProfileStudentId] = useState(null);
  const flushing = useRef(false);

  // every page change starts at the top
  useEffect(() => { window.scrollTo?.(0, 0); }, [page]);

  const loadStudents = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from("students")
        .select("*, assessments(score, estimated_level, completed_at)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setStudents(data.map(summarizeStudent));
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-send results that could not be saved earlier. Stops at the first
  // network failure, but skips over entries the server rejected.
  const flushPending = useCallback(async () => {
    if (!supabase || flushing.current) return;
    flushing.current = true;
    setSyncing(true);
    try {
      for (const entry of getPendingAssessments()) {
        const res = await saveAssessment(supabase, entry);
        if (res.ok) {
          removePendingAssessment(entry.localId);
        } else {
          updatePendingAssessment(res.entry);
          if (!res.error?.code) { // no server error code = network problem
            setOnline(false);
            break;
          }
        }
      }
    } finally {
      flushing.current = false;
      setSyncing(false);
      setPendingCount(getPendingAssessments().length);
    }
  }, []);

  const syncAndReload = useCallback(async () => {
    await flushPending();
    await loadStudents();
  }, [flushPending, loadStudents]);

  useEffect(() => {
    syncAndReload();
    window.addEventListener("online", syncAndReload);
    return () => window.removeEventListener("online", syncAndReload);
  }, [syncAndReload]);

  const startAssessment = (student, type) => {
    const bank = getBank(student.age_group, type);
    setSession({
      student, type, mode: modeOf(student.age_group),
      questions: prepareQuestions(bank), startedAt: new Date().toISOString()
    });
    setResult(null);
    setPage("test");
  };

  const finishAssessment = async answers => {
    const { student, type, mode, questions: bank, startedAt } = session;
    const r = { ...calculateResult(bank, answers), runId: startedAt, saveStatus: "saving" };
    const setStatus = saveStatus => setResult(cur => (cur && cur.runId === startedAt ? { ...cur, saveStatus } : cur));
    setResult(r);
    setPage("results");

    // Demo students (or no Supabase): keep the result in memory only.
    if (!supabase || !isPersistedStudent(student)) {
      setStudents(prev => prev.map(s => {
        if (s.id !== student.id) return s;
        const assessment = {
          id: `local-${Date.now()}`,
          title: `${type === "initial" ? "Initial Level Assessment" : "Progress Test"} · ${mode.label}`,
          type,
          score: r.percentage,
          estimated_level: r.level,
          completed_at: new Date().toISOString()
        };
        return {
          ...s,
          level: r.level,
          score: r.percentage,
          tests: (s.tests || 0) + 1,
          assessments: [assessment, ...(s.assessments || [])]
        };
      }));
      setStatus("demo");
      return;
    }

    const entry = buildEntry({ student, type, questions: bank, answers, result: r, startedAt, modeLabel: mode.label });
    const res = await saveAssessment(supabase, entry);
    if (res.ok) {
      setStatus("saved");
      loadStudents();
    } else {
      if (!res.error?.code) setOnline(false);
      const queued = addPendingAssessment(res.entry);
      setPendingCount(getPendingAssessments().length);
      setStatus(queued ? "queued" : "failed");
    }
  };

  const navBtn = (target, label, icon, active = [target]) => (
    <button className={active.includes(page) ? "active" : ""} onClick={() => setPage(target)}>
      {icon} {label}
    </button>
  );
  const openStudents = filter => { setStudentFilter(filter); setPage("students"); };
  const openProfile = student => { setProfileStudentId(student.id); setPage("profile"); };
  const updateStudentInState = updated => {
    setStudents(prev => prev.map(s => s.id === updated.id ? summarizeStudent(updated) : s));
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setPage("dashboard")}>
          <span className="brand-mark">L</span>
          <span><strong>LinguaTrack</strong><small>English assessment & progress</small></span>
        </button>
        <nav>
          {navBtn("dashboard", "Dashboard", <LayoutDashboard size={17} />)}
          {navBtn("students", "Students", <Users size={17} />, ["students", "add-student"])}
          {navBtn("tests", "Tests", <ClipboardList size={17} />)}
        </nav>
        <span className={"connection " + (online ? "online" : "offline")}>
          {!supabase ? "Local demo mode" : online ? "Supabase connected" : "Supabase unreachable"}
        </span>
      </header>

      {supabase && pendingCount > 0 && (
        <div className="sync-bar">
          <span>{pendingCount} result{pendingCount === 1 ? "" : "s"} saved on this device, not yet synced.</span>
          <button className="outline" onClick={syncAndReload} disabled={syncing}>
            <RefreshCw size={14} /> {syncing ? "Syncing..." : "Sync now"}
          </button>
        </div>
      )}

      <main>
        {page === "dashboard" && (
          <Dashboard students={students} loading={loading} onStart={startAssessment} onStudents={openStudents} onProfile={openProfile} />
        )}
        {page === "students" && (
          <Students
            students={students} loading={loading} onStart={startAssessment} onProfile={openProfile}
            filter={studentFilter} onFilter={setStudentFilter} onAdd={() => setPage("add-student")}
          />
        )}
        {page === "profile" && profileStudentId && (
          <StudentProfile
            student={students.find(s => s.id === profileStudentId)}
            onBack={() => setPage("students")}
            onStart={startAssessment}
            onUpdated={updateStudentInState}
          />
        )}
        {page === "add-student" && (
          <AddStudent
            defaultAge={studentFilter === "all" ? "Adult" : studentFilter}
            onBack={() => setPage("students")}
            onCreated={s => { setStudents(prev => [s, ...prev]); setPage("students"); }}
          />
        )}
        {page === "tests" && <Tests />}
        {page === "test" && session && (
          <Assessment key={session.startedAt} session={session} onFinish={finishAssessment} onCancel={() => setPage("students")} />
        )}
        {page === "results" && result && session && (
          <Results
            result={result}
            student={session.student}
            mode={session.mode}
            onBack={() => setPage("students")}
            onRetake={() => startAssessment(session.student, session.type)}
          />
        )}
      </main>

      {page !== "test" && (
        <div className="bottom-nav">
          {navBtn("dashboard", "Dashboard", <LayoutDashboard size={20} />)}
          {navBtn("students", "Students", <Users size={20} />, ["students", "add-student"])}
          {navBtn("tests", "Tests", <ClipboardList size={20} />)}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 6;

function Dashboard({ students, loading, onStart, onStudents, onProfile }) {
  const assessed = students.filter(s => s.tests > 0 && s.score != null);
  const avgOf = list => (list.length ? Math.round(list.reduce((a, s) => a + Number(s.score), 0) / list.length) : null);
  const avg = avgOf(assessed);
  const levelsTracked = new Set(assessed.map(s => s.level).filter(l => l && l !== "—")).size;

  return (
    <div className="page">
      <div className="hero">
        <div>
          <span className="eyebrow">TEACHER DASHBOARD</span>
          <h1>Know where they are.<br /><em>See where they're going.</em></h1>
          <p>Assess practical English ability, keep results in one place, and follow progress over time.</p>
        </div>
        <button className="primary large" onClick={() => onStudents("all")}><Plus size={19} /> Start an assessment</button>
      </div>
      <div className="stats">
        <Stat icon={<Users />} label="Students" value={students.length} />
        <Stat icon={<ClipboardList />} label="Assessments" value={students.reduce((a, s) => a + Number(s.tests || 0), 0)} />
        <Stat icon={<BarChart3 />} label="Average score" value={avg === null ? "—" : avg + "%"} />
        <Stat icon={<GraduationCap />} label="Levels tracked" value={levelsTracked} />
      </div>

      <div className="mini-head"><span className="eyebrow">BY AGE GROUP</span></div>
      <div className="mode-cards">
        {AGE_GROUPS.map(g => {
          const m = MODES[g];
          const list = students.filter(s => s.age_group === g);
          const groupAvg = avgOf(list.filter(s => s.tests > 0 && s.score != null));
          return (
            <button key={g} className={"mode-card mode-" + m.key} onClick={() => onStudents(g)}>
              <span className="mode-emoji">{m.emoji}</span>
              <div>
                <strong>{m.label}</strong>
                <small>{list.length} student{list.length === 1 ? "" : "s"} · avg {groupAvg === null ? "—" : groupAvg + "%"}</small>
              </div>
              <ChevronRight size={18} />
            </button>
          );
        })}
      </div>

      <section className="section-head">
        <div><span className="eyebrow">RECENT STUDENTS</span><h2>Keep an eye on progress</h2></div>
        <button className="text-button" onClick={() => onStudents("all")}>View all</button>
      </section>
      <StudentList students={students.slice(0, PAGE_SIZE)} loading={loading} onStart={onStart} onProfile={onProfile} className="student-grid" />
      <div className="notice">
        <BookOpen size={20} />
        <div>
          <strong>Assessment note</strong>
          <p>Results are estimates designed to support teaching decisions. They are not official CEFR certification.</p>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }) {
  return (
    <div className="stat">
      <span className="stat-icon">{icon}</span>
      <div><small>{label}</small><strong>{value}</strong></div>
    </div>
  );
}

function StudentList({ students, loading, onStart, onProfile, className, emptyText = "No students yet. Use “Add student” to create the first one." }) {
  if (loading) return <p className="muted">Loading students…</p>;
  if (!students.length) return <p className="muted">{emptyText}</p>;
  return <div className={className}>{students.map(s => <StudentCard key={s.id} student={s} onStart={onStart} onProfile={onProfile} />)}</div>;
}

function StudentCard({ student, onStart, onProfile }) {
  const tests = student.tests || 0;
  const mode = modeOf(student.age_group);
  return (
    <article className={"student-card mode-" + mode.key}>
      <div className="avatar">{student.name?.charAt(0).toUpperCase()}</div>
      <div className="student-info">
        <button className="student-name" onClick={() => onProfile(student)}>{student.name}</button>
        <span>{mode.emoji} {mode.label} · {tests} assessment{tests === 1 ? "" : "s"}</span>
      </div>
      <span className="level">{tests > 0 ? student.level : "—"}</span>
      <div className="card-score">
        <strong>{tests > 0 && student.score != null ? student.score + "%" : "—"}</strong>
        <span>latest</span>
      </div>
      <div className="card-actions">
        <button className="outline profile-button" onClick={() => onProfile(student)}>View profile</button>
        {tests === 0 ? (
          <button className="primary" onClick={() => onStart(student, "initial")}>Initial assessment</button>
        ) : (
          <>
            <button className="outline" onClick={() => onStart(student, "progress")}>Progress test</button>
            <button className="text-button" onClick={() => onStart(student, "initial")}>Redo initial</button>
          </>
        )}
      </div>
    </article>
  );
}

// 1 … 4 5 6 … 12 — always shows first, last and the pages around the current one.
function pageWindow(current, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = [...new Set([1, pages, current - 1, current, current + 1])].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  keep.forEach((n, i) => {
    if (i > 0 && n - keep[i - 1] > 1) out.push("gap-" + n);
    out.push(n);
  });
  return out;
}

function Pager({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <div className="pager" role="navigation" aria-label="Pagination">
      <button className="outline" disabled={page === 1} onClick={() => onChange(page - 1)}><ChevronLeft size={16} /> Prev</button>
      {pageWindow(page, pages).map(n =>
        typeof n === "string"
          ? <span key={n} className="page-gap">…</span>
          : <button key={n} className={"page-num" + (n === page ? " active" : "")} aria-current={n === page ? "page" : undefined} onClick={() => onChange(n)}>{n}</button>
      )}
      <button className="outline" disabled={page === pages} onClick={() => onChange(page + 1)}>Next <ChevronRight size={16} /></button>
    </div>
  );
}

function Students({ students, loading, onStart, onProfile, onAdd, filter, onFilter }) {
  const [query, setQuery] = useState("");
  const [pageNo, setPageNo] = useState(1);

  const q = query.trim().toLowerCase();
  const filtered = students.filter(s =>
    (filter === "all" || s.age_group === filter) && (!q || (s.name || "").toLowerCase().includes(q))
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(pageNo, pages);
  const from = (current - 1) * PAGE_SIZE;
  const shown = filtered.slice(from, from + PAGE_SIZE);
  const count = g => students.filter(s => s.age_group === g).length;

  const changeFilter = f => { setPageNo(1); onFilter(f); };
  const changeQuery = v => { setPageNo(1); setQuery(v); };

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <span className="eyebrow">STUDENT MANAGEMENT</span>
          <h1>Students</h1>
          <p>Choose a learner to begin an assessment.</p>
        </div>
        <button className="primary" onClick={onAdd}><Plus size={18} /> Add student</button>
      </div>

      <div className="toolbar">
        <label className="search">
          <Search size={16} />
          <input value={query} onChange={e => changeQuery(e.target.value)} placeholder="Search by name" aria-label="Search students" />
        </label>
        <div className="chips" role="group" aria-label="Filter by age group">
          <button className={"chip" + (filter === "all" ? " active" : "")} onClick={() => changeFilter("all")}>All <small>{students.length}</small></button>
          {AGE_GROUPS.map(g => (
            <button key={g} className={"chip" + (filter === g ? " active" : "")} onClick={() => changeFilter(g)}>
              {MODES[g].emoji} {MODES[g].label} <small>{count(g)}</small>
            </button>
          ))}
        </div>
      </div>

      <StudentList
        students={shown}
        loading={loading}
        onStart={onStart}
        onProfile={onProfile}
        className="student-list"
        emptyText={students.length ? "No students match this search or filter." : undefined}
      />
      {!loading && filtered.length > 0 && (
        <p className="list-meta">Showing {from + 1}–{from + shown.length} of {filtered.length}</p>
      )}
      <Pager page={current} pages={pages} onChange={setPageNo} />
    </div>
  );
}

function StudentProfile({ student, onBack, onStart, onUpdated }) {
  const [notes, setNotes] = useState(student?.notes || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!student) {
    return (
      <div className="page">
        <button className="back" onClick={onBack}><ChevronLeft size={17} /> Back to students</button>
        <p className="muted">Student not found.</p>
      </div>
    );
  }

  const assessments = [...(student.assessments || [])].sort(
    (a, b) => new Date(b.completed_at) - new Date(a.completed_at)
  );

  const saveNotes = async () => {
    setSaving(true);
    setSaved(false);

    if (!supabase || !isPersistedStudent(student)) {
      onUpdated({ ...student, notes });
      setSaving(false);
      setSaved(true);
      return;
    }

    const { data, error } = await supabase
      .from("students")
      .update({ notes })
      .eq("id", student.id)
      .select("*, assessments(score, estimated_level, completed_at)")
      .single();

    if (!error) {
      onUpdated(data);
      setSaved(true);
    }
    setSaving(false);
  };

  return (
    <div className="page profile-page">
      <button className="back" onClick={onBack}><ChevronLeft size={17} /> Back to students</button>

      <div className="profile-hero">
        <div className={"profile-avatar mode-" + modeOf(student.age_group).key}>
          {student.name?.charAt(0).toUpperCase()}
        </div>
        <div>
          <span className="eyebrow">STUDENT PROFILE</span>
          <h1>{student.name}</h1>
          <p>{modeOf(student.age_group).emoji} {modeOf(student.age_group).label} · {assessments.length} assessment{assessments.length === 1 ? "" : "s"}</p>
        </div>
        <button className="primary" onClick={() => onStart(student, assessments.length ? "progress" : "initial")}>
          <ClipboardList size={17} /> {assessments.length ? "New progress test" : "Start assessment"}
        </button>
      </div>

      <div className="profile-grid">
        <div className="panel">
          <span className="eyebrow">ASSESSMENT NOTES</span>
          <h2>Teacher notes</h2>
          <p className="muted">Save observations, areas to practise, or goals for this student. These notes stay with the student profile.</p>
          <textarea
            className="notes-input"
            value={notes}
            onChange={e => { setNotes(e.target.value); setSaved(false); }}
            placeholder="Example: Review past tense and everyday conversation. Student is more confident when questions are short and clear."
            rows={8}
          />
          <div className="notes-actions">
            <button className="primary" onClick={saveNotes} disabled={saving}>{saving ? "Saving..." : "Save notes"}</button>
            {saved && <span className="saved-note">Saved.</span>}
          </div>
        </div>

        <div className="panel">
          <span className="eyebrow">CURRENT SNAPSHOT</span>
          <h2>Latest result</h2>
          <div className="profile-stat"><span>Estimated level</span><strong>{student.level || "—"}</strong></div>
          <div className="profile-stat"><span>Latest score</span><strong>{student.score != null ? student.score + "%" : "—"}</strong></div>
          <div className="profile-stat"><span>Assessments</span><strong>{assessments.length}</strong></div>
          <p className="muted profile-footnote">The level is an estimate for teaching support, not an official CEFR certificate.</p>
        </div>
      </div>

      <div className="panel assessment-history">
        <span className="eyebrow">ASSESSMENT HISTORY</span>
        <h2>Results over time</h2>
        {assessments.length === 0 ? (
          <p className="muted">No assessments yet. Start the first assessment from this profile.</p>
        ) : (
          <div className="history-list">
            {assessments.map((a, i) => (
              <div className="history-item" key={a.id || i}>
                <div>
                  <strong>{a.title || (a.type === "initial" ? "Initial Level Assessment" : "Progress Test")}</strong>
                  <span>{a.completed_at ? new Date(a.completed_at).toLocaleDateString() : "Date unavailable"}</span>
                </div>
                <span className="level">{a.estimated_level || "—"}</span>
                <strong>{a.score != null ? a.score + "%" : "—"}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AddStudent({ onCreated, onBack, defaultAge = "Adult" }) {
  const [name, setName] = useState("");
  const [age, setAge] = useState(defaultAge);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError("");
    if (!supabase) {
      onCreated({ id: "local-" + Date.now(), name: trimmed, age_group: age, level: "—", score: null, tests: 0 });
      return;
    }
    try {
      const { data, error: err } = await supabase
        .from("students").insert({ name: trimmed, age_group: age }).select().single();
      if (err) throw err;
      onCreated(summarizeStudent(data));
    } catch {
      setError("Couldn't save the student. Check the connection and try again.");
      setSaving(false);
    }
  };

  return (
    <div className="narrow">
      <button className="back" onClick={onBack}><ChevronLeft size={17} /> Back</button>
      <div className="panel">
        <span className="eyebrow">NEW LEARNER</span>
        <h1>Add a student</h1>
        <label>Name
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && save()}
            placeholder="e.g. Sarah"
          />
        </label>
        <span className="field-label" id="age-label">Age group</span>
        <div className="age-picker" role="radiogroup" aria-labelledby="age-label">
          {AGE_GROUPS.map(g => {
            const m = MODES[g];
            return (
              <button
                key={g} type="button" role="radio" aria-checked={age === g}
                className={"age-option mode-" + m.key + (age === g ? " active" : "")}
                onClick={() => setAge(g)}
              >
                <span className="mode-emoji">{m.emoji}</span>
                <strong>{m.label}</strong>
                <small>{m.tagline}</small>
              </button>
            );
          })}
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="primary full" disabled={saving || !name.trim()} onClick={save}>
          {saving ? "Saving..." : "Save student"}
        </button>
      </div>
    </div>
  );
}

function levelRange(bank) {
  const present = LEVELS.filter(l => bank.some(q => q.level === l));
  return present.length > 1 ? `${present[0]}–${present[present.length - 1]}` : present[0];
}

function Tests() {
  return (
    <div className="page">
      <div className="section-head">
        <div>
          <span className="eyebrow">ASSESSMENTS</span>
          <h1>Test library</h1>
          <p>Each age group has its own short initial assessment and progress test, chosen automatically from the student's age group. Initial assessments never exceed 15 questions.</p>
        </div>
        <button className="primary" onClick={() => alert("Test builder is the next feature: create a test, add questions, set answers, publish.")}>
          <Plus size={18} /> Create test
        </button>
      </div>
      <div className="test-grid three">
        {AGE_GROUPS.map(g => {
          const m = MODES[g];
          const initial = getBank(g, "initial");
          const progress = getBank(g, "progress");
          return (
            <div className={"test-tile mode-" + m.key} key={g}>
              <span className="pill">{m.emoji} {m.label.toUpperCase()}</span>
              <h2>{m.label}</h2>
              <p>{m.tagline}.</p>
              <ul className="bank-list">
                <li><strong>Initial assessment</strong><span>{initial.length} questions · {levelRange(initial)} · {m.time.initial}</span></li>
                <li><strong>Progress test</strong><span>{progress.length} questions · {levelRange(progress)} · {m.time.progress}</span></li>
              </ul>
            </div>
          );
        })}
      </div>
      <div className="notice">
        <ClipboardList size={20} />
        <div>
          <strong>Question design</strong>
          <p>Questions are original and use CEFR-style task types and level descriptions from established English-learning resources. The wording is intentionally short and familiar for non-native English speakers.</p>
        </div>
      </div>
    </div>
  );
}

function Assessment({ session, onFinish, onCancel }) {
  const { student, type, mode, questions: bank } = session;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const q = bank[index];
  const selected = answers[q.id];
  const skillText = mode.skillLabels[q.skill] || q.skill;
  const cheer = selected !== undefined && mode.cheers.length ? mode.cheers[index % mode.cheers.length] : null;

  const choose = i => setAnswers(a => ({ ...a, [q.id]: i }));
  const exit = () => {
    if (Object.keys(answers).length === 0 || window.confirm("Leave this assessment? The answers so far will be lost.")) onCancel();
  };
  const finish = () => {
    if (submitting) return;
    setSubmitting(true);
    onFinish(answers);
  };

  return (
    <div className={"test-page mode-" + mode.key}>
      <div className="test-top">
        <button className="back" onClick={exit}><ChevronLeft size={17} /> Exit</button>
        <div>
          <strong>{type === "initial" ? "Initial Level Assessment" : "Progress Test"}</strong>
          <span>{student?.name} · {mode.label}</span>
        </div>
        <span>{index + 1} / {bank.length}</span>
      </div>
      <div className="progress"><span style={{ width: `${((index + 1) / bank.length) * 100}%` }} /></div>
      <div className="question-wrap" key={q.id}>
        <span className="question-meta">{mode.showLevelInTest ? `${q.level} · ${skillText}` : skillText}</span>
        <h1>{q.question}</h1>
        <div className="options">
          {q.options.map((o, i) => (
            <button key={i} className={selected === i ? "selected" : ""} onClick={() => choose(i)}>
              <span>{String.fromCharCode(65 + i)}</span>{o}
            </button>
          ))}
        </div>
        {mode.cheers.length > 0 && <p className="cheer">{cheer || "\u00a0"}</p>}
        <div className="question-nav">
          {index > 0
            ? <button className="outline" onClick={() => setIndex(i => i - 1)}><ChevronLeft /> Back</button>
            : <span />}
          {index < bank.length - 1
            ? <button className="primary" disabled={selected === undefined} onClick={() => setIndex(i => i + 1)}>Next <ChevronRight /></button>
            : <button className="primary" disabled={selected === undefined || submitting} onClick={finish}>Finish assessment <CheckCircle2 size={18} /></button>}
        </div>
      </div>
    </div>
  );
}

const SAVE_MESSAGES = {
  saving: "Saving result…",
  saved: "Result saved.",
  demo: "Demo mode: this result is not stored permanently.",
  queued: "Couldn't reach Supabase. The result is saved on this device and will sync automatically.",
  failed: "Couldn't save this result anywhere. Please note it down before leaving this page."
};

function Results({ result, student, mode, onBack, onRetake }) {
  const stars = starsFor(result.percentage);
  return (
    <div className={"page results mode-" + mode.key}>
      <button className="back" onClick={onBack}><ChevronLeft size={17} /> Back to students</button>

      <div className="result-hero">
        <span className="eyebrow">ASSESSMENT COMPLETE</span>
        <h1>{mode.resultTitle(student?.name)}</h1>
        {mode.key === "kids" && (
          <div className="stars" role="img" aria-label={`${stars} out of 3 stars`}>{"⭐".repeat(stars)}{"☆".repeat(3 - stars)}</div>
        )}
        <div className="level-result">
          <span>Estimated level</span>
          <strong>{result.level}</strong>
          <small>{result.percentage}% overall</small>
        </div>
        {result.ceiling && (
          <p className="muted">Every level in this test was passed, and it only measures up to {result.topLevel}, so the true level may be higher.</p>
        )}
        <p className={"save-status " + result.saveStatus}>{SAVE_MESSAGES[result.saveStatus]}</p>
      </div>

      <div className="result-grid">
        <div className="panel">
          <span className="eyebrow">SKILL PROFILE</span>
          <h2>Where they are strongest</h2>
          {Object.entries(result.skills).map(([skill, value]) => {
            const d = result.skillDetail[skill];
            return (
              <div className="skill" key={skill}>
                <div>
                  <span>{skill} <small className="count">{d.correct}/{d.total}</small></span>
                  <strong>{value}%</strong>
                </div>
                <div className="bar"><span style={{ width: value + "%" }} /></div>
              </div>
            );
          })}
        </div>

        <div className="panel">
          <span className="eyebrow">TEACHING FOCUS</span>
          <h2>Useful next step</h2>
          {result.strongest && result.weakest ? (
            <>
              <p>Strongest area: <b>{result.strongest}</b></p>
              <p>Focus area: <b>{result.weakest}</b></p>
            </>
          ) : (
            <p>Skills are evenly balanced, with no single area standing out.</p>
          )}
          <div className="score-big">{result.correct}<small> / {result.total} correct</small></div>
          <p className="muted">Use this result as a teaching guide rather than an official certification.</p>
        </div>
      </div>

      <div className="panel level-panel">
        <span className="eyebrow">BY LEVEL</span>
        <h2>How each level went</h2>
        {result.levels.map(l => (
          <div className="skill" key={l.level}>
            <div>
              <span>{l.level} <small className="count">{l.correct}/{l.total}</small></span>
              <strong>{l.percentage}%</strong>
            </div>
            <div className="bar"><span style={{ width: l.percentage + "%" }} /></div>
          </div>
        ))}
      </div>

      <div className="result-actions">
        <button className="outline" onClick={onRetake}>Retake</button>
        <button className="primary" onClick={onBack}>Done</button>
      </div>
    </div>
  );
}

export default App;
