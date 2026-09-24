// The three student modes. Keys match the `age_group` values in the database.
export const AGE_GROUPS = ["Child", "Teen", "Adult"];

export const MODES = {
  Child: {
    group: "Child",
    key: "kids",
    label: "Kids",
    emoji: "🧒",
    tagline: "Picture-friendly questions, big buttons, friendly wording",
    time: { initial: "~8–12 minutes", progress: "~5–8 minutes" },
    showLevelInTest: false,
    skillLabels: { Grammar: "Sentences ✏️", Vocabulary: "Words 🔤", Reading: "Reading 📖", "Everyday English": "Talking 💬" },
    cheers: ["Nice choice! 👍", "Great thinking! 🌟", "You've got this! 💪", "Keep going! 🚀"],
    resultTitle: name => `Great job, ${name}! 🎉`
  },
  Teen: {
    group: "Teen",
    key: "teens",
    label: "Teens",
    emoji: "🎧",
    tagline: "School, friends and real-life situations",
    time: { initial: "~8–12 minutes", progress: "~5–8 minutes" },
    showLevelInTest: false,
    skillLabels: {},
    cheers: [],
    resultTitle: name => `Nice work, ${name}.`
  },
  Adult: {
    group: "Adult",
    key: "adults",
    label: "Adults",
    emoji: "💼",
    tagline: "Work, travel and everyday English",
    time: { initial: "~8–12 minutes", progress: "~5–8 minutes" },
    showLevelInTest: true,
    skillLabels: {},
    cheers: [],
    resultTitle: name => `${name}'s result`
  }
};

/** Unknown or missing age groups fall back to the adult mode. */
export const modeOf = ageGroup => MODES[ageGroup] || MODES.Adult;

/** 1–3 stars for the kids results screen. Always at least one: it is a friendly screen. */
export const starsFor = percentage => (percentage >= 80 ? 3 : percentage >= 50 ? 2 : 1);
