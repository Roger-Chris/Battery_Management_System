# Component parameter research log

Reviewed 28 September 2026 for the demo simulation. Manufacturer datasheets are preferred over reseller listings. A datasheet setting is not evidence that the Raspberry Pi firmware or a breakout board is actually using that setting; entries marked **VERIFY** remain provisional in the UI and in `src/core/config/bom.ts`.

## Values now represented in the model

| Part / parameter | Value and use | Evidence and qualification |
|---|---|---|
| ADS1115 data rate | 128 samples/s per conversion for the initial simulation timing baseline | TI lists 8, 16, 32, 64, 128, 250, 475 and 860 SPS; the power-on default is 128 SPS. Firmware can select a different rate, so verify the actual driver configuration. [TI ADS1115 datasheet, SBAS444E](https://www.ti.com/lit/ds/symlink/ads1115.pdf) |
| ADS1115 common-mode input impedance | 6 MΩ at ±4.096 V PGA range | TI electrical characteristics. This is already used by the divider-loading model. [TI ADS1115 datasheet](https://www.ti.com/lit/ds/symlink/ads1115.pdf) |
| INA226 averaging | 1 sample after power-on reset | The configuration register defaults to one sample. Firmware may change it; verify the actual driver configuration. [TI INA226 datasheet, SBOS547C](https://www.ti.com/lit/ds/symlink/ina226.pdf) |
| INA226 shunt and bus conversion time | 1.1 ms each after power-on reset | The datasheet's default VSHCT and VBUSCT settings are 1.1 ms. This yields a nominal 2.2 ms shunt-plus-bus conversion cycle at one-sample averaging; verify the actual driver configuration. [TI INA226 datasheet](https://www.ti.com/lit/ds/symlink/ina226.pdf) |
| DS18B20 temperature conversion | 12-bit resolution, 750 ms conversion; ±0.5 °C from −10 °C to +85 °C | Datasheet limits. The handoff specifies 12-bit operation; confirm the probes are configured accordingly. This applies to the sensor IC, not waterproof probe response time. [Analog Devices DS18B20 datasheet, Rev. 6](https://www.analog.com/media/en/technical-documentation/data-sheets/ds18b20.pdf) |
| IRLZ44N on-resistance | 25 mΩ maximum at VGS = 5 V and ID = 25 A (TJ = 25 °C) | Manufacturer table. This supports the existing BOM value, but the actual gate drive and device variant still need verification. [Infineon IRLZ44N datasheet](https://www.infineon.com/assets/row/public/documents/24/49/infineon-irlz44n-datasheet-en.pdf) |
| MCP4725 interface | 12-bit DAC; address includes fixed device bits, factory-programmed A2/A1, and the A0 pin state | A 0x60 7-bit address follows only when the specific part has A2/A1 = 00 and A0 = 0. Breakout-board wiring and part variant must be inspected or checked with `i2cdetect`. [Microchip MCP4725 datasheet, DS20002039E](https://ww1.microchip.com/downloads/aemDocuments/documents/MSLD/ProductDocuments/DataSheets/MCP4725-Data-Sheet-20002039E.pdf) |
| 5 A ATO fuse candidate | Typical melting I²t = 26 A²s for Littelfuse ATOF 287 part 0287005 | Littelfuse describes ATOF 287 as replacing obsolete ATO 257. Its listed I²t is a typical average before arcing from breaking-capacity tests, not a guaranteed total clearing threshold. The installed fuse is not identified; use this value only as a provisional demo input until the actual marking and intended fuse model are confirmed. [Littelfuse ATOF 287 datasheet](https://www.littelfuse.com/assetdocs/littelfuse-datasheet-287-atof?assetguid=43dcdce8-8ca2-426f-8998-7e566f048d40) |

## Values deliberately left unresolved

| Parameter | Why a web lookup cannot establish the rig value | How to resolve |
|---|---|---|
| MCP4725 address on the purchased module | The chip address depends on its A2/A1 ordering variant and A0 strap; module wiring is not specified by the chip datasheet. | Read the actual address with `i2cdetect` and record the module/part marking. |
| INA226 timing and averaging actually used | The datasheet gives legal settings and reset defaults, but software can rewrite them. | Read back/log the configuration register at boot; compare with the provisional POR baseline. |
| ADS1115 per-channel schedule actually used | The datasheet gives legal data rates, but the application may use another rate, single-shot mode, or per-channel PGA settings. | Read/log the configuration used by the deployed firmware. |
| Waterproof DS18B20 probe lag | The bare IC datasheet specifies conversion time and accuracy, not thermal time constant for the selected probe, cable, adhesive, or mounting. | Measure the installed probe's step response. |
| DMEGC 26E OCV curve and dynamic resistance / RC values | Manufacturer product literature gives rated limits but no validated OCV(SOC) table or application-specific pulse response curve. A curve for a different cell chemistry is not transferable as a precise cell property. | Use the project's T8 rested discharge and T9 pulse data; validate on held-out T10 data. Until then, preserve the profile's provisional label and uncertainty band. [DMEGC 18650-26E product page](https://dmegc.com.cn/product/details/63.html?lang=en) |
| Cell thermal parameters | Cell thermal behavior depends on the actual cells, fixture, airflow, probe contact and test profile; the current profile's thermal block is a different-cell literature structure and a provisional fit starting point. | Fit against installed-cell T12 temperature data and validate against a separate run. |
| BMS OV/UV thresholds, delays and balancing threshold | The specified board is generic and its seller listing does not identify a controlled manufacturer datasheet/revision. | Record exact board markings and measure thresholds/delays in T0b using a current-limited supply and the documented safe test setup. |
| Charger open-circuit voltage | The product rating specifies a nominal charger output, not the unit's measured unloaded output. | Measure T0a with a DMM and log the result. |
| Heatsink thermal resistance and transient response | The selected heatsink, fan, mounting, resistor enclosure and airflow are not identified; a generic listing cannot provide an installed-system thermal model. | Measure steady-state T6 resistance and record a time series during each load step to fit transient response. |
| Actual fuse characteristic | The parts list says 5 A ATO and mentions the obsolete 257 family only as a possible part. It does not confirm manufacturer, part number, revision, or holder. | Inspect and log the fuse marking; use its matching manufacturer time-current and melting/clearing data. |

## Simulation policy

- Use manufacturer-supported facts directly when the referenced part/configuration matches.
- Use datasheet power-on defaults only as an explicitly labeled baseline; do not call them the physical rig configuration until read back from firmware.
- Do not fill sensor lag, cell dynamic parameters, generic BMS thresholds, or heatsink behavior with values copied from unrelated components or internet examples.
- Store every numerical model input as a provenance-typed `Parameter<T>` in `src/core/config/`; preserve **VERIFY**, **Provisional**, and uncertainty labeling.
- A `model-to-measurement` plot requires an independently generated model trace and a bench trace; do not fit and validate against the same run.
