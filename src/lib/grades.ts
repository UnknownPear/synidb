// /lib/grades.ts
export const GRADE_KEYS = ["A", "B", "C", "D", "P"] as const;
export type Grade = typeof GRADE_KEYS[number];

export type GradeMeta = {
  code: Grade;
  label: string;
  condition: string;     // human condition text
  light: string;         // tailwind classes for light theme chips
  dark: string;          // tailwind classes for dark theme chips
};

export const GRADE_META: Record<Grade, GradeMeta> = {
  A: {
    code: "A",
    label: "Grade A",
    condition: "Excellent",
    light: "border-emerald-300 text-emerald-700 bg-emerald-50",
    dark:  "border-emerald-600 text-emerald-400 bg-emerald-900/30",
  },
  B: {
    code: "B",
    label: "Grade B",
    condition: "Good",
    light: "border-blue-300 text-blue-700 bg-blue-50",
    dark:  "border-blue-600 text-blue-400 bg-blue-900/30",
  },
  C: {
    code: "C",
    label: "Grade C",
    condition: "Fair",
    light: "border-amber-300 text-amber-700 bg-amber-50",
    dark:  "border-amber-600 text-amber-400 bg-amber-900/30",
  },
  D: {
    code: "D",
    label: "Grade D",
    condition: "Rough",
    light: "border-rose-300 text-rose-700 bg-rose-50",
    dark:  "border-rose-600 text-rose-400 bg-rose-900/30",
  },
  P: {
    code: "P",
    label: "Grade P",
    condition: "For Parts",
    light: "border-slate-300 text-slate-700 bg-slate-50",
    dark:  "border-slate-600 text-slate-300 bg-slate-900/30",
  },
} as const;

export const ALL_GRADES: Grade[] = GRADE_KEYS.slice() as Grade[];

export function gradeToCondition(g: Grade): string {
  return GRADE_META[g].condition;
}

export function conditionToGrade(condition: string): Grade {
  const entry = (Object.entries(GRADE_META) as [Grade, GradeMeta][])
    .find(([, m]) => m.condition.toLowerCase() === condition.toLowerCase());
  return entry?.[0] ?? "B";
}
