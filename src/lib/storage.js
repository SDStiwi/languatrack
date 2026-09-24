// Results that could not be saved (offline, Supabase down, ...) wait here and
// are re-sent automatically. localStorage can be unavailable (private mode,
// quota), so every access is guarded and writes report success.
const KEY = "linguatrack_pending_assessments";

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export const getPendingAssessments = read;

export function addPendingAssessment(entry) {
  return write([...read().filter(e => e.localId !== entry.localId), entry]);
}

export function updatePendingAssessment(entry) {
  return write(read().map(e => (e.localId === entry.localId ? entry : e)));
}

export function removePendingAssessment(localId) {
  return write(read().filter(e => e.localId !== localId));
}
