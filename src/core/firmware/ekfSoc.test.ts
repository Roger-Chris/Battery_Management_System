import { describe, expect, it } from "vitest";
import { DMEGC_INR18650_26E } from "../config/cellProfile";
import { ocvFromSoc } from "../cell/ocv";
import { coulombCountStep } from "./coulombCounting";
import { initialEkfState, stepEkf } from "./ekfSoc";

describe("ekfSoc", () => {
  const profile = DMEGC_INR18650_26E;
  const noise = { processNoiseQ: 1e-7, measurementNoiseR: 1e-4 };

  it("corrects coulomb-counting drift from a miscalibrated capacity toward a true OCV measurement", () => {
    const trueCapacityAh = 2.6;
    const firmwareCapacityAh = 2.6 * 1.05; // firmware's capacity estimate is 5% too high -> drift
    let trueSoc = 0.8;
    let coulombOnlySoc = 0.8;
    let ekf = initialEkfState(0.8);

    const currentA = 1.0;
    const dtS = 1;
    for (let t = 0; t < 3600; t++) {
      trueSoc = Math.max(0, trueSoc - (currentA * dtS) / (trueCapacityAh * 3600));
      coulombOnlySoc = coulombCountStep(coulombOnlySoc, currentA, dtS, firmwareCapacityAh);
      const ocvEstimateV = ocvFromSoc(trueSoc, profile); // a perfect rest-voltage measurement
      ekf = stepEkf(ekf, currentA, dtS, firmwareCapacityAh, ocvEstimateV, profile, noise);
    }

    const coulombOnlyError = Math.abs(coulombOnlySoc - trueSoc);
    const ekfError = Math.abs(ekf.socFraction - trueSoc);
    expect(ekfError).toBeLessThan(coulombOnlyError);
    expect(ekfError).toBeLessThan(0.01);
  });

  it("keeps variance bounded (filter does not diverge) over many steps", () => {
    let ekf = initialEkfState(0.5);
    for (let t = 0; t < 5000; t++) {
      const ocvEstimateV = ocvFromSoc(0.5, profile);
      ekf = stepEkf(ekf, 0, 1, 2.6, ocvEstimateV, profile, noise);
    }
    expect(ekf.varianceP).toBeGreaterThan(0);
    expect(ekf.varianceP).toBeLessThan(1);
  });
});
