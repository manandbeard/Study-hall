export const FSRS_W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
  0.1740, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655,
  0.6621, 0.0600, 0.4665,
];

export function retrievability(t: number, S: number): number {
  if (S <= 0) return 0.0;
  const w20 = FSRS_W[20];
  return Math.pow(Math.pow(0.9, 1.0 / S), Math.pow(t, w20));
}

export function initialStability(grade: number): number {
  return FSRS_W[grade - 1];
}

export function initialDifficulty(grade: number): number {
  return FSRS_W[4] - (grade - 3) * FSRS_W[5];
}

export function stabilityAfterSuccess(S: number, D: number, R: number, grade: number): number {
  let gradeModifier = 1.0;
  if (grade === 2) gradeModifier = FSRS_W[15];
  else if (grade === 4) gradeModifier = FSRS_W[16];

  const inner =
    Math.exp(FSRS_W[8]) *
    (11 - D) *
    Math.pow(S, -FSRS_W[9]) *
    (Math.exp(FSRS_W[10] * (1 - R)) - 1) *
    gradeModifier +
    1;
  return S * inner;
}

export function stabilityAfterLapse(S: number, D: number, R: number): number {
  return (
    FSRS_W[11] *
    Math.pow(D, -FSRS_W[12]) *
    (Math.pow(S + 1, FSRS_W[13]) - 1) *
    Math.exp(FSRS_W[14] * (1 - R))
  );
}

export function updateDifficulty(D: number, grade: number): number {
  const dD = -FSRS_W[6] * (grade - 3);
  const DDoublePrime = D + (dD * (10 - D)) / 9.0;
  const D0Easy = initialDifficulty(4);
  const DPrime = FSRS_W[5] * D0Easy + (1 - FSRS_W[5]) * DDoublePrime;
  return Math.max(1.0, Math.min(10.0, DPrime));
}

export function step(S: number, D: number, elapsedDays: number, grade: number): { S_next: number; D_next: number; R: number } {
  const R = elapsedDays > 0 ? retrievability(elapsedDays, S) : 1.0;
  
  let S_next;
  if (grade === 1) {
    S_next = stabilityAfterLapse(S, D, R);
  } else {
    S_next = stabilityAfterSuccess(S, D, R, grade);
  }
  
  const D_next = updateDifficulty(D, grade);
  
  return { S_next, D_next, R };
}
