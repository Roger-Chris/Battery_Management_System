# Firmware port notes: `src/core/firmware/` + `src/core/sim/scheduler.ts` -> the Pi's Python

`src/core/firmware/` is exactly what the Pi runs (CLAUDE_CODE_PROMPT.md). Every function in it
is pure (no I/O, no globals, no framework) so each one ports 1:1 into a plain Python function
with the same name, same argument order, and the same return shape. The tables below give that
mapping; the "Python stdlib / package" column is what the real Pi firmware would import to do
the I/O this simulation only models.

## Module-by-module mapping

| TS module | Python module (suggested) | I/O it would need on the Pi |
|---|---|---|
| `firmware/calibration.ts` | `firmware/calibration.py` | none — pure math |
| `firmware/tapToCell.ts` | `firmware/tap_to_cell.py` | none — pure math |
| `firmware/protection.ts` | `firmware/protection.py` | none — pure math; constants re-exported from `config/validate_design.py` and `config/bom.py` (Phase 1's ports) |
| `firmware/chargeControl.ts` | `firmware/charge_control.py` | drives GPIO17 (the charge relay) via `RPi.GPIO` or `gpiozero.OutputDevice` |
| `firmware/coulombCounting.ts` | `firmware/coulomb_counting.py` | none — pure math, fed by `hardware/ina226.py`'s register reads |
| `firmware/ekfSoc.ts` | `firmware/ekf_soc.py` | none — pure math (`numpy` optional, not required for a 1-state filter) |
| `firmware/anomalyChecks.ts` | `firmware/anomaly_checks.py` | none — pure math |
| `firmware/ble.ts` | `firmware/ble_auth.py` | GATT server (`bleak` for a BLE client role, `bless` or BlueZ D-Bus for a peripheral/GATT server role); HMAC via stdlib `hmac` + `hashlib.sha256`, not Web Crypto |
| `firmware/telemetry.ts` | `firmware/telemetry.py` | stdlib `sqlite3`, executing `TELEMETRY_TABLE_SQL`/`EVENTS_TABLE_SQL` verbatim and binding `telemetry_row_to_values()`/`event_row_to_values()` to `INSERT INTO ... VALUES (?, ...)` |
| `sim/scheduler.ts` | `sim/scheduler.py` | on the Pi this becomes the real event loop (a `while True` with `time.monotonic()` in place of the simulated `tS`), not a generator over a fixed duration |

Hardware register models the firmware calls into (`core/hardware/*.ts`) port the same way, plus
their actual I/O:

| TS module | Python I/O |
|---|---|
| `hardware/divider.ts`, `hardware/ads1115.ts` | `smbus2` (I2C) reads of the two ADS1115s at 0x48/0x49 |
| `hardware/ina226.ts` | `smbus2` reads of the two INA226s at 0x40/0x41 |
| `hardware/ds18b20.ts` | `/sys/bus/w1/devices/28-*/w1_slave` (kernel 1-Wire driver) or the `w1thermsensor` package |
| `hardware/load.ts` | `smbus2` write to the MCP4725 DAC (0x60, VERIFY with `i2cdetect`) |
| `hardware/bmsBoard.ts`, `hardware/fuse.ts`, `hardware/charger.ts` | no direct Pi I/O — these characterise hardware the Pi only observes indirectly through the INA226/ADS1115/DS18B20 readings above |
| `hardware/relay.ts` | `RPi.GPIO`/`gpiozero` digital output |

## Line-by-line correspondence example

`src/core/firmware/coulombCounting.ts`:

```ts
export function coulombCountStep(
  prevSocFraction: number,
  measuredCurrentA: number,
  dtS: number,
  capacityAh: number,
): number {
  const capacityAs = capacityAh * 3600;
  return prevSocFraction - (measuredCurrentA * dtS) / capacityAs;
}
```

ports line-by-line to:

```python
def coulomb_count_step(prev_soc_fraction: float, measured_current_a: float, dt_s: float, capacity_ah: float) -> float:
    capacity_as = capacity_ah * 3600
    return prev_soc_fraction - (measured_current_a * dt_s) / capacity_as
```

Every other pure-math function in `firmware/` and `hardware/` follows the same pattern: same
name in `snake_case`, same argument order, same arithmetic, same constants (imported from the
Python ports of `config/bom.ts`/`config/validateDesign.ts` from Phase 1, not re-typed).

## Where the port is not line-by-line

- **`ble.ts`**: the crypto primitive (`hmac.new(key, msg, hashlib.sha256).digest()`) is a
  one-line equivalent, but the *transport* — the BLE GATT server accepting the challenge and
  returning the response — has no TypeScript equivalent here (this simulation drives
  `verifyResponse()` directly, as the Test T14 page will). The Pi's Python needs an actual GATT
  characteristic wired to `verify_response()`.
- **`telemetry.ts`**: the DDL/row-builder functions are 1:1, but the file open, `sqlite3.connect()`,
  cursor, and `commit()` calls only exist in the Python firmware, never in `src/core/`.
- **`sim/scheduler.ts`**: the simulation's `fixedStepSchedule()` is a bounded generator over a
  known `durationS`, useful for producing expected traces. The Pi's real scheduler is an
  unbounded loop paced against wall-clock time (`time.monotonic()`), using the same per-sensor
  period logic but never terminating.
- **`chargeControl.ts`**: `hardware/relay.ts`'s `relay()`/`relayOutputV()` model the relay's
  electrical behaviour; the Pi's `charge_control.py` additionally calls
  `GPIO.output(RELAY_PIN, GPIO.HIGH if closed else GPIO.LOW)`, which has no simulation
  equivalent.
