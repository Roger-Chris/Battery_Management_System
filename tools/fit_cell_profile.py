"""
Fit cell profile fields from bench CSVs (data/bench_log_template.csv column layout) and write
them back into a data/cell_profiles/*.json profile with source="measured".

Replaces the provisional placeholders in data/cell_profiles/dmegc_inr18650_26e.json:
  - ocv_curve   <- test T8  (C/20 discharge, coulomb-counted SOC vs rested cell voltage)
  - r0_ohm, rc_pairs <- test T9 (10 s pulse / 60 s rest, every 10% SOC)
  - thermal.R_surf_K_per_W <- test T12 (surface DS18B20 during T7, fit against the two-node model)

Numerical method for the pulse fit: variable projection (grid search + golden-section refine
over the two RC time constants, linear least squares for the amplitudes at each trial point;
numpy only, no scipy needed) to recover two decaying exponentials from the relaxation after
each pulse. R0 itself comes from the instantaneous voltage step, not the exponential fit.

Note: separating two RC time constants needs a relaxation window several times longer than the
slower tau. The provisional profile's placeholder slow branch is tau ~= 300 s; test T9's 60 s
rest (docs/TEST_PLAN_EXPECTED_VS_MEASURED.md) will likely under-resolve it — if the fit comes
back with a very wide or unstable tau2, lengthen the rest period rather than trust the number.

Run:
  python tools/fit_cell_profile.py --selftest
  python tools/fit_cell_profile.py ocv --csv <T8.csv> --capacity-ah 2.6 --profile <path> --out <path>
  python tools/fit_cell_profile.py pulse --csv <T9.csv> --profile <path> --out <path>
  python tools/fit_cell_profile.py thermal --csv <T12.csv> --profile <path> --out <path>
"""
import argparse
import csv
import json
import sys

import numpy as np


# --------------------------------------------------------------------------- bench CSV loading
def load_bench_csv(path):
    """Read a data/bench_log_template.csv-shaped file into {column_name: [values]}, numeric
    columns parsed as float, everything else left as strings."""
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        columns = {name: [] for name in reader.fieldnames}
        for row in reader:
            for name, value in row.items():
                columns[name].append(value)
    for name, values in columns.items():
        try:
            columns[name] = [float(v) for v in values]
        except (ValueError, TypeError):
            pass
    return columns


# --------------------------------------------------------------------------- OCV curve (T8)
def fit_ocv_curve(rows, capacity_ah, soc_grid=None):
    """C/20 full discharge (near-equilibrium): coulomb-count SOC from ina1_current_a and pair
    it with cell voltage, resampled onto `soc_grid` (default: the same 21-point 0..1 grid the
    provisional curve uses, so the two are directly comparable)."""
    if soc_grid is None:
        soc_grid = [round(i * 0.05, 2) for i in range(21)]

    t = np.asarray(rows["timestamp_s"], dtype=float)
    i = np.asarray(rows["ina1_current_a"], dtype=float)  # discharge positive, by convention
    v = np.asarray(rows["cell1_v"], dtype=float) + np.asarray(rows["cell2_v"], dtype=float) + \
        np.asarray(rows["cell3_v"], dtype=float) + np.asarray(rows["cell4_v"], dtype=float)
    v_cell_avg = v / 4.0

    dt = np.diff(t, prepend=t[0])
    charge_removed_ah = np.cumsum(i * dt) / 3600.0
    soc = 1.0 - charge_removed_ah / capacity_ah
    soc = np.clip(soc, 0.0, 1.0)

    # soc is monotonically decreasing (discharge); np.interp needs ascending x.
    order = np.argsort(soc)
    ocv_at_grid = np.interp(soc_grid, soc[order], v_cell_avg[order])
    return {"soc": list(soc_grid), "ocv_V": [round(float(x), 4) for x in ocv_at_grid]}


# --------------------------------------------------------------------------- double-exponential fit
def _double_exp_basis(t, tau1, tau2):
    return np.column_stack([np.exp(-t / tau1), np.exp(-t / tau2), np.ones_like(t)])


def _double_exp_residual(t, y, tau1, tau2):
    basis = _double_exp_basis(t, tau1, tau2)
    coeffs, _, _, _ = np.linalg.lstsq(basis, y, rcond=None)
    rmse = float(np.sqrt(np.mean((basis @ coeffs - y) ** 2)))
    return coeffs, rmse


def _golden_section_min(f, a, b, iters=40):
    gr = (np.sqrt(5) - 1) / 2
    c = b - gr * (b - a)
    d = a + gr * (b - a)
    fc, fd = f(c), f(d)
    for _ in range(iters):
        if fc < fd:
            b, d, fd = d, c, fc
            c = b - gr * (b - a)
            fc = f(c)
        else:
            a, c, fc = c, d, fd
            d = a + gr * (b - a)
            fd = f(d)
    return (a + b) / 2


def fit_double_exponential(t, y, tau_bounds=(0.5, 300.0)):
    """Variable projection: search over the two nonlinear time constants (tau1, tau2), solving
    the linear amplitudes/offset by least squares at each trial point. Grid search for a
    starting point, then coordinate-descent (golden-section per axis) to refine. More robust
    to measurement noise than a direct Prony fit when the two time constants are close
    together, which a raw linear-recurrence fit is ill-conditioned for."""
    t = np.asarray(t, dtype=float)
    y = np.asarray(y, dtype=float)
    if len(y) < 8:
        raise ValueError("need at least 8 samples for a two-exponential + offset fit")

    lo, hi = tau_bounds
    grid = np.geomspace(lo, hi, 20)
    best_rmse, tau1, tau2 = None, grid[0], grid[-1]
    for a in grid:
        for b in grid:
            if b <= a:
                continue
            _, rmse = _double_exp_residual(t, y, a, b)
            if best_rmse is None or rmse < best_rmse:
                best_rmse, tau1, tau2 = rmse, a, b

    for _ in range(10):
        tau1 = _golden_section_min(
            lambda x: _double_exp_residual(t, y, x, tau2)[1],
            max(lo, tau1 * 0.3),
            min(tau2 * 0.99, tau1 * 3),
        )
        tau2 = _golden_section_min(
            lambda x: _double_exp_residual(t, y, tau1, x)[1],
            max(tau1 * 1.01, tau2 * 0.3),
            min(hi, tau2 * 3),
        )

    (A1, A2, y_inf), _rmse = _double_exp_residual(t, y, tau1, tau2)
    return float(tau1), float(tau2), float(A1), float(A2), float(y_inf)


def fit_pulse_r0_rc(t_relax, v_relax, pulse_current_a, v_just_before_release, v_just_after_release):
    """Fit R0 from the instantaneous step at pulse release, and two RC pairs from the 60 s
    relaxation that follows (test T9)."""
    r0 = abs(v_just_after_release - v_just_before_release) / abs(pulse_current_a)
    tau1, tau2, A1, A2, _v_inf = fit_double_exponential(t_relax, v_relax)
    if tau1 > tau2:
        tau1, tau2, A1, A2 = tau2, tau1, A2, A1
    r1 = abs(A1) / abs(pulse_current_a)
    r2 = abs(A2) / abs(pulse_current_a)
    return {
        "r0_ohm": round(r0, 5),
        "rc_pairs": [
            {"R_ohm": round(r1, 5), "tau_s": round(tau1, 1)},
            {"R_ohm": round(r2, 5), "tau_s": round(tau2, 1)},
        ],
    }


def fit_pulse_from_csv(rows):
    """Extract one pulse/relaxation cycle from a T9 CSV: expects current from
    `ina2_current_a`, and pack voltage from cell1..4_v summed."""
    t = np.asarray(rows["timestamp_s"], dtype=float)
    i = np.asarray(rows["ina2_current_a"], dtype=float)
    v = (
        np.asarray(rows["cell1_v"], dtype=float)
        + np.asarray(rows["cell2_v"], dtype=float)
        + np.asarray(rows["cell3_v"], dtype=float)
        + np.asarray(rows["cell4_v"], dtype=float)
    )
    pulse_on = i > (0.5 * np.max(i))
    release_idx = int(np.where(np.diff(pulse_on.astype(int)) == -1)[0][0]) + 1
    pulse_current_a = float(np.mean(i[:release_idx][pulse_on[:release_idx]]))
    v_before = float(v[release_idx - 1])
    v_after = float(v[release_idx])
    t_relax = t[release_idx:] - t[release_idx]
    v_relax = v[release_idx:]
    return fit_pulse_r0_rc(t_relax, v_relax, pulse_current_a, v_before, v_after)


# --------------------------------------------------------------------------- thermal (T12)
def fit_thermal_rsurf(t, t_surf, t_amb, p_watts, thermal_fixed, r_surf_bounds=(0.5, 30.0)):
    """Grid + refine search for R_surf_K_per_W that minimises RMSE between the two-node
    thermal model (same equations as src/core/cell/thermal.ts) and a measured T_surf series,
    holding the profile's other thermal parameters fixed."""

    def simulate(r_surf):
        core_c = t_amb[0]
        surf_c = t_amb[0]
        out = np.empty_like(t_surf)
        out[0] = surf_c
        for k in range(1, len(t)):
            dt = t[k] - t[k - 1]
            q_core_to_surf = (core_c - surf_c) / thermal_fixed["R_core_K_per_W"]
            q_surf_to_amb = (surf_c - t_amb[k]) / r_surf
            core_c += ((p_watts - q_core_to_surf) / thermal_fixed["C_core_J_per_K"]) * dt
            surf_c += ((q_core_to_surf - q_surf_to_amb) / thermal_fixed["C_surf_J_per_K"]) * dt
            out[k] = surf_c
        return out

    def rmse(r_surf):
        return float(np.sqrt(np.mean((simulate(r_surf) - t_surf) ** 2)))

    lo, hi = r_surf_bounds
    for _ in range(40):
        m1 = lo + (hi - lo) / 3
        m2 = hi - (hi - lo) / 3
        if rmse(m1) < rmse(m2):
            hi = m2
        else:
            lo = m1
    r_surf = (lo + hi) / 2
    return round(r_surf, 3), rmse(r_surf)


# --------------------------------------------------------------------------- profile I/O
PROVISIONAL_SOURCES = {"listing", "provisional", "assumed"}


def update_profile(profile_path, out_path, updates, measurement_ref):
    with open(profile_path) as f:
        profile = json.load(f)

    for field, value in updates.items():
        profile["fields"][field] = {"value": value, "source": "measured", "ref": measurement_ref}

    still_provisional = any(
        isinstance(v, dict) and v.get("source") in PROVISIONAL_SOURCES
        for v in profile["fields"].values()
    )
    profile["status"] = "provisional" if still_provisional else "final"

    with open(out_path, "w") as f:
        json.dump(profile, f, indent=2)
    return profile


# --------------------------------------------------------------------------- self-test (no bench data required)
def selftest():
    rng = np.random.default_rng(0)
    # Well-separated time constants (matching the provisional profile's placeholder RC pairs,
    # data/cell_profiles/dmegc_inr18650_26e.json: tau ~= 20 s and ~= 300 s) over a relaxation
    # window long enough to observe both branches decay. A real T9 rest of only 60 s would not
    # resolve tau2 this slow — see the module docstring note.
    dt = 2.0
    n = 450  # 900 s window, 3x the slow time constant
    t = np.arange(n) * dt
    true_r1, true_tau1 = 0.015, 20.0
    true_r2, true_tau2 = 0.015, 300.0
    pulse_current_a = 1.0
    v_rest_before_pulse = 3.75
    r0_true = 0.035

    v_before_release = v_rest_before_pulse - pulse_current_a * (r0_true + true_r1 + true_r2)
    v_after_release = v_before_release + pulse_current_a * r0_true

    v_relax = (
        v_rest_before_pulse
        - pulse_current_a * true_r1 * np.exp(-t / true_tau1)
        - pulse_current_a * true_r2 * np.exp(-t / true_tau2)
    )
    v_relax_noisy = v_relax + rng.normal(0, 0.0003, size=n)

    fitted = fit_pulse_r0_rc(t, v_relax_noisy, pulse_current_a, v_before_release, v_after_release)

    def close(a, b, tol):
        return abs(a - b) <= tol * max(abs(b), 1e-9)

    checks = [
        ("r0_ohm", fitted["r0_ohm"], r0_true, 0.05),
        ("R1_ohm", fitted["rc_pairs"][0]["R_ohm"], true_r1, 0.15),
        ("tau1_s", fitted["rc_pairs"][0]["tau_s"], true_tau1, 0.15),
        ("R2_ohm", fitted["rc_pairs"][1]["R_ohm"], true_r2, 0.15),
        ("tau2_s", fitted["rc_pairs"][1]["tau_s"], true_tau2, 0.15),
    ]
    ok = True
    for name, got, want, tol in checks:
        passed = close(got, want, tol)
        ok = ok and passed
        print(f"  {'PASS' if passed else 'FAIL'} {name}: fit={got:.4f} true={want:.4f} (tol {tol*100:.0f}%)")

    # Thermal fit self-test: synthesize a step response at a known R_surf, then recover it.
    thermal_fixed = {"C_core_J_per_K": 36, "C_surf_J_per_K": 9, "R_core_K_per_W": 4}
    r_surf_true = 7.0
    n_t = 4000
    t_therm = np.arange(n_t) * 1.0
    t_amb = np.full(n_t, 25.0)
    p_watts = 1.5
    core_c, surf_c = 25.0, 25.0
    t_surf_true = np.empty(n_t)
    for k in range(n_t):
        t_surf_true[k] = surf_c
        if k == n_t - 1:
            break
        q1 = (core_c - surf_c) / thermal_fixed["R_core_K_per_W"]
        q2 = (surf_c - t_amb[k]) / r_surf_true
        core_c += (p_watts - q1) / thermal_fixed["C_core_J_per_K"]
        surf_c += (q1 - q2) / thermal_fixed["C_surf_J_per_K"]
    r_surf_fit, rmse = fit_thermal_rsurf(t_therm, t_surf_true, t_amb, p_watts, thermal_fixed)
    passed = close(r_surf_fit, r_surf_true, 0.05)
    ok = ok and passed
    print(f"  {'PASS' if passed else 'FAIL'} R_surf_K_per_W: fit={r_surf_fit:.3f} true={r_surf_true:.3f} (rmse {rmse:.4f} K)")

    return ok


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--selftest", action="store_true", help="verify the fitting methods on synthetic data")
    sub = parser.add_subparsers(dest="command")

    p_ocv = sub.add_parser("ocv", help="fit ocv_curve from a T8 CSV")
    p_ocv.add_argument("--csv", required=True)
    p_ocv.add_argument("--capacity-ah", type=float, required=True)
    p_ocv.add_argument("--profile", required=True)
    p_ocv.add_argument("--out", required=True)

    p_pulse = sub.add_parser("pulse", help="fit r0_ohm and rc_pairs from a T9 CSV")
    p_pulse.add_argument("--csv", required=True)
    p_pulse.add_argument("--profile", required=True)
    p_pulse.add_argument("--out", required=True)

    p_thermal = sub.add_parser("thermal", help="fit thermal.R_surf_K_per_W from a T12 CSV")
    p_thermal.add_argument("--csv", required=True)
    p_thermal.add_argument("--p-watts", type=float, required=True)
    p_thermal.add_argument("--profile", required=True)
    p_thermal.add_argument("--out", required=True)

    args = parser.parse_args()

    if args.selftest:
        ok = selftest()
        sys.exit(0 if ok else 1)

    if args.command == "ocv":
        rows = load_bench_csv(args.csv)
        curve = fit_ocv_curve(rows, args.capacity_ah)
        update_profile(args.profile, args.out, {"ocv_curve": curve}, f"Fit from {args.csv} (test T8)")
    elif args.command == "pulse":
        rows = load_bench_csv(args.csv)
        fitted = fit_pulse_from_csv(rows)
        update_profile(
            args.profile,
            args.out,
            {"r0_ohm": fitted["r0_ohm"], "rc_pairs": fitted["rc_pairs"]},
            f"Fit from {args.csv} (test T9)",
        )
    elif args.command == "thermal":
        rows = load_bench_csv(args.csv)
        with open(args.profile) as f:
            profile = json.load(f)
        thermal_fixed = profile["fields"]["thermal"]["value"]
        t = np.asarray(rows["timestamp_s"], dtype=float)
        t_surf = np.asarray(rows["t_spare_c"], dtype=float)
        t_amb = np.asarray(rows["t_ambient_c"], dtype=float)
        r_surf, rmse = fit_thermal_rsurf(t, t_surf, t_amb, args.p_watts, thermal_fixed)
        print(f"Fitted R_surf_K_per_W={r_surf}, RMSE={rmse:.3f} C")
        updated_thermal = dict(thermal_fixed, R_surf_K_per_W=r_surf)
        update_profile(args.profile, args.out, {"thermal": updated_thermal}, f"Fit from {args.csv} (test T12)")
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
