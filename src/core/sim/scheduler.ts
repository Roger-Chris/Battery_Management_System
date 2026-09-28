/**
 * Fixed-step scheduler honoring each sensor's real sample timing. Runs physics at a fixed
 * `dtS`, and at each tick reports which named sensors (from `periodsS`, e.g. the ADS1115's
 * round-robin period, the INA226's conversion+averaging time, the DS18B20's 750 ms
 * conversion) have a fresh reading due, so callers drive each hardware model
 * (core/hardware/*.ts) only as often as the real part actually samples.
 *
 * Periods are converted to step counts (`Math.round(periodS / dtS)`) rather than accumulated
 * as floats, so a long run cannot drift out of sync with real elapsed time.
 */
export interface SensorPeriodsS {
  [sensorName: string]: number;
}

export interface ScheduleTick {
  tS: number;
  dueSensors: string[];
}

export function* fixedStepSchedule(dtS: number, durationS: number, periodsS: SensorPeriodsS): Generator<ScheduleTick> {
  const periodSteps: Record<string, number> = {};
  const nextDueStep: Record<string, number> = {};
  for (const [name, periodS] of Object.entries(periodsS)) {
    const steps = Math.max(1, Math.round(periodS / dtS));
    periodSteps[name] = steps;
    nextDueStep[name] = steps;
  }

  const totalSteps = Math.round(durationS / dtS);
  for (let step = 0; step <= totalSteps; step++) {
    const dueSensors: string[] = [];
    for (const name of Object.keys(periodsS)) {
      if (step >= nextDueStep[name]!) {
        dueSensors.push(name);
        nextDueStep[name]! += periodSteps[name]!;
      }
    }
    yield { tS: step * dtS, dueSensors };
  }
}
