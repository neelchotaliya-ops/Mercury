/**
 * The test harness the repo already uses, extracted so the database scripts
 * can share it: a list of named cases, each returning a failure message or
 * null, printed as `ok`/`FAIL` with a non-zero exit on any failure.
 *
 * Widened to allow async cases, since every database call is a promise.
 */
export interface Case {
  name: string;
  run: () => string | null | Promise<string | null>;
}

export function eq(label: string, actual: unknown, expected: unknown): string | null {
  return actual === expected
    ? null
    : `${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`;
}

/** Float comparison for money totals, where exact equality is the wrong test. */
export function close(
  label: string,
  actual: number,
  expected: number,
  tolerance = 0.005
): string | null {
  return Math.abs(actual - expected) <= tolerance
    ? null
    : `${label}: got ${actual}, expected ${expected} (±${tolerance})`;
}

export function deepEq(label: string, actual: unknown, expected: unknown): string | null {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  return a === b ? null : `${label}:\n        got      ${a}\n        expected ${b}`;
}

export async function runCases(cases: Case[], label: string): Promise<void> {
  let failures = 0;

  for (const c of cases) {
    let failure: string | null;
    try {
      failure = await c.run();
    } catch (e) {
      failure = `threw: ${e instanceof Error ? e.message : String(e)}`;
    }

    if (failure) {
      failures += 1;
      console.log(`FAIL  ${c.name}\n        ${failure}`);
    } else {
      console.log(`ok    ${c.name}`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }

  console.log(`\nAll ${cases.length} ${label} passed.`);
}
