import { questions as adultsInitial, progressQuestionBank as adultsProgress } from "./questions";
import { kidsInitial, kidsProgress } from "./kids";
import { teensInitial, teensProgress } from "./teens";

// Keyed by the student's age_group value stored in the database.
const BANKS = {
  Child: { initial: kidsInitial, progress: kidsProgress },
  Teen: { initial: teensInitial, progress: teensProgress },
  Adult: { initial: adultsInitial, progress: adultsProgress }
};

export const getBank = (ageGroup, type) => (BANKS[ageGroup] || BANKS.Adult)[type];
