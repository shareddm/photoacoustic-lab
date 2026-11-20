# Reconstruction guide: images, signals and receiver geometry

**The dataset will be available after publication of the accompanying paper. Downloads are intentionally disabled until then.** This guide describes the self-contained acquisition bundles prepared for a future release. The current website is an interactive demo with 50 fixed procedural vessel images and no dataset download.

## Start with axes and a target

Load `data/signals/pa_signals.npz` with `allow_pickle=False` and decode `metadata_utf8`. Inspect `engine`, `kwave_executed`, `rf_axes`, physical field size, `time_us`, `depth_axis_mm` and receiver coordinates before choosing a reconstruction method.

Choose your supervised target explicitly:

- `absorber_weight`: assigned 2D vessel strength, with stronger absorbers brighter.
- `input_reference`: the resampled grayscale reference, whose polarity can be inverted relative to absorber strength.
- `initial_pressure_pa`: the assigned initial pressure on the source sheet, including illumination assumptions.
- An assigned 3D phantom made from `absorber_weight`, `depth_mm` and the specified axial thickness.

`reconstruction_volume` and the stored projections are baseline algorithm outputs, not independent ground truth. An XY projection alone cannot identify the true experimental depth or original A-lines. Recovering absorber weight from fluence-dependent signals is a different inverse problem from reconstructing initial pressure.

## Raster / one moving transducer

RF shape is `[scan_y, scan_x, time]`. Each position is a separate shot with its own t=0. Use `scan_x_mm` and `scan_y_mm` for the actual receiver trajectory; the single entry in `detector_positions_mm` is only the reference center.

A simple baseline is:

1. Remove an estimated DC offset and, if needed, apply a documented receive-band filter.
2. Form an analytic-signal envelope along the last (time) axis.
3. For each desired depth z, sample the envelope at `t_us = water_path_mm/1.48 + z_mm/c_tissue_mm_us` (or use 1.48 throughout for water).
4. Assemble `[z,y,x]` and take a maximum over depth for the XY MAP.

Do not use `z=c*t/2`, which is a pulse-echo relation. These are one-way photoacoustic arrivals. The time array can start after zero because the recording window is cropped. Interpolate using the stored time samples and handle out-of-window samples explicitly.

This baseline does not undo focus blur, limited bandwidth, attenuation or nonuniform illumination. Deconvolution needs an assumed or measured system response and appropriate regularization; avoid treating a generated response as an independently measured calibration.

## Array / simultaneous receivers

RF shape is `[detector,time]`. Each row corresponds to the same row of `detector_positions_mm` and `receiver_geometry.csv`. One laser shot is shared across receivers. Preserve detector order and coordinates together when batching or augmenting.

For a point r and receiver j, calculate a one-way travel time

```text
tau_j(r) = L_water(r,j)/c_water + L_tissue(r,j)/c_tissue.
```

A basic matched-filter delay-and-sum reconstruction is

```text
q_j(tau) = sum_t rf_j(t) * h(t - tau) / sum_t h(t)^2
image(r) = max(0, sum_j w_j(r) * q_j(tau_j(r))).
```

The supplied baseline uses the same approximate packet family as the forward model, geometric spreading compensation and a positivity condition. This is an intentionally matched model; it can give optimistic synthetic results. Independent forward models, held-out physical parameters and experimental data are needed to assess robustness.

Reconstruction by geometry:

| Geometry | What to retain / expect |
| --- | --- |
| Linear | Store all 3D coordinates. A single line has poor elevation information; consider a constrained section or explicitly acknowledge 3D ambiguity. |
| Curved | Use the actual X–Z arc, radius and angular extent. A circular or spherical full-view formula is not automatically appropriate. |
| Ring | Use in-plane positions and acknowledge out-of-plane ambiguity. A 2D ring reconstruction can be a useful constrained baseline, not proof of a general 3D inverse. |
| Matrix | Coordinates sample both lateral axes. Reshape by matrix rows only when the stored ordering is known; counts need not form a perfect square. One-sided and sparse-view artifacts remain. |
| Hemisphere | Use every 3D position and the actual upper-hemisphere coverage. Do not assume a closed sphere. |

If using time reversal or another wave-equation method, build an acoustic grid and medium in consistent SI units, map receivers in their stored order, preserve the sample-time origin, and check grid/time convergence. The included MATLAB runner is raster-only. k-Wave supports Cartesian sensor coordinates, but additional array forward simulation and reconstruction code is required; exported array metadata is not evidence that such a run occurred.

## Preparing data for ML / AI

1. **Group by source geometry.** All noise, wavelength, depth, frequency and array variants of one seed belong in the same split. The 50 demo seeds are a small exploration set, not a validated training benchmark.
2. **Preserve units and axes.** RF length and sampling can change with frequency and geometry. Resample or pad deliberately, keep masks for padding, and retain the original time axis.
3. **Define normalization.** Fit scaling using the training set only. Do not independently normalize each RF trace if absolute or inter-channel amplitude relationships are relevant. Record transformations and invert them where appropriate.
4. **Condition on the experiment.** A geometry-aware model can receive RF, receiver coordinates, sample times, medium parameters and requested reconstruction coordinates. Raster data and arbitrary array lists should not be treated as identical tensors without an explicit mapping.
5. **Choose an input pathway.** Options include raw RF to an image, RF features plus coordinates to a volume, or improvement of a conventional baseline reconstruction. These are different tasks with different failure modes.
6. **Evaluate more than visual similarity.** Compare vessel continuity, localization, widths and false structures; use initial-pressure/amplitude error only when target units and gain make that meaningful. Evaluate robustness on changed physics and, for real-world claims, experimental recordings.

A compact inspection example:

```python
import json
import numpy as np

d = np.load('data/signals/pa_signals.npz', allow_pickle=False)
m = json.loads(d['metadata_utf8'].tobytes())
rf = d['rf_noisy'].astype(np.float32)
target = d['absorber_weight']

if m['rf_axes'] == ['scan_y','scan_x','time']:
    assert rf.shape[:2] == target.shape
    x_mm, y_mm = d['scan_x_mm'], d['scan_y_mm']
else:
    receivers_mm = d['detector_positions_mm']
    assert rf.shape[0] == receivers_mm.shape[0]

assert np.array_equal(d['reconstruction_volume'].max(axis=0), d['projection_xy'])
```

Do not train against PNGs when exact float targets are available. PNG files are intended for viewing and quick interchange; they quantize intensity to 8 bits. Keep `metadata.json`, `physics.md`, this guide and the NPZ with every acquisition, including when sharing derived samples.
