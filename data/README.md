# Photoacoustic Lab data guide

**Release status: dataset downloads are not published.** The website currently offers 50 procedural vessel examples (seeds 1–50) for interactive investigation. This folder documents the paired-data format prepared for a future release. No training acquisitions are distributed with this public demo.

## What a future acquisition download contains

Every acquisition is packaged as one ZIP with this structure:

```text
data/
  README.md
  physics.md
  reconstruction_guide.md
  metadata.json
  scene.json
  receiver_geometry.csv
  images/
    input_reference.png
    absorber_weight.png
    reconstruction_xy.png
  signals/
    pa_signals.npz
```

The 2D PNG files are 8-bit visual references. Exact floating-point images, initial pressures, signals and reconstructed volumes are in the NPZ. Input references are resampled to the selected square grid; the original uploaded file is not included. `reconstruction_xy.png` follows the selected grayscale convention, while `absorber_weight.png` always uses brighter pixels for stronger assigned absorbers.

The original input image and reconstructed image are different quantities. A top-view maximum-amplitude projection does not uniquely specify vessel depth or original signals. The assigned depth sheet and optical properties define one possible synthetic phantom, not recovered anatomical ground truth.

## Load the acquisition

```python
import json
import numpy as np
from PIL import Image

d = np.load('data/signals/pa_signals.npz', allow_pickle=False)
metadata = json.loads(d['metadata_utf8'].tobytes())
reference = d['input_reference']
target = d['absorber_weight']
rf = d['rf_noisy']
time_us = d['time_us']
volume = d['reconstruction_volume']
positions_mm = d['detector_positions_mm']
preview = Image.open('data/images/input_reference.png')
assert np.array_equal(volume.max(axis=0), d['projection_xy'])
print(metadata['engine'], metadata['rf_axes'], rf.shape)
```

NPZ contains plain NPY arrays in C order. No Python pickle is required. Always inspect metadata and axes before stacking samples.

| Array | Axes / units |
| --- | --- |
| `input_reference` | [y,x], resampled grayscale reference in [0,1] |
| `absorber_weight` | [y,x], assigned relative source strength in [0,1] |
| `depth_mm` | [y,x], assigned depth below the surface in mm |
| `initial_pressure_pa` | [y,x], initial pressure on the assigned sheet in Pa |
| `rf_clean`, `rf_noisy` | Raster: [scan_y,scan_x,time]; arrays: [detector,time]; relative receive units |
| `time_us` | [time], RF sample coordinates in microseconds |
| `reconstruction_volume` | [depth_z,y,x], nonnegative reconstructed amplitude |
| `depth_axis_mm` | [depth_z], reconstructed voxel depths in mm |
| `projection_xy` | [y,x], maximum over reconstructed Z |
| `projection_yz`, `projection_zx` | [z,y] and [z,x], maximum over X and Y |
| `detector_positions_mm` | [detector,3], X/Y/Z coordinates in mm |
| `scan_x_mm`, `scan_y_mm` | Raster only: coordinate axes for the moving receiver |
| `detector_peak` | Arrays only: maximum absolute RF for each receiver |
| `laser_time_us` | [laser_time], fine pulse samples around time zero |
| `laser_intensity_mw_cm2` | [laser_time], surface intensity in MW/cm2 |
| `map_raw`, `map_shape`, `map_display` | Legacy raster RF-max map or array reconstructed depth-max map, plus normalized / grayscale variants |
| `metadata_utf8` | UTF-8 JSON encoded as uint8 bytes |

In raster mode, `detector_positions_mm` contains one reference-center position. Actual per-trace positions are given by `scan_x_mm` and `scan_y_mm`; do not treat all raster traces as fixed-center recordings. `receiver_geometry.csv` uses the same convention. For arrays, CSV row order and NPZ detector order are identical.

## Coordinates, time and scaling

- X and Y span the selected field. Pixel centers are `(index + 0.5) * field_mm / image_size`.
- Positive Z is depth below the surface. Negative receiver Z is above the surface in the coupling region.
- Raster traces represent separate laser shots, each using its own pulse time zero. Array channels observe one simultaneous shot.
- Raster recording windows are cropped around expected arrivals and need not begin at zero. Array windows start at zero. Use `time_us`, not an assumed sample index origin.
- Laser and PA arrays have different sample grids, but share pulse time zero. Laser intensity integrates to surface fluence after the appropriate unit conversion.
- RF amplitudes are relative units, not calibrated sensor pressure or voltage. Individual traces are not normalized. Oscilloscope autoscaling and visual depth stretch do not change stored data.
- Physical `initial_pressure_pa` does not make the approximate receiver output calibrated. Do not compare different engine modes as if their arbitrary gains were a measured instrument response.

## Preserve provenance and labels

Keep the full configuration, engine name, `kwave_executed`, source identity, seed, receiver positions, time axis, units, assigned depth model and noise settings with each sample. `analytic-raster-surrogate` and `analytic-array-surrogate` do not execute k-Wave. The separate MATLAB raster reference reports `k-Wave-3D-raster-reference`.

The public examples use fixed 128 x 128 procedural source images before resampling to the selected grid. Seed identifies geometry; changing receiver or laser settings does not create a new independent anatomical example. Keep all variants of a source seed in one train/validation/test group. User-imported images must be grouped by their own source identities.

Read [physics.md](physics.md) for assumptions and [reconstruction_guide.md](reconstruction_guide.md) for geometry-specific reconstruction and ML preparation. A future dataset release must state licensing and experimental validation separately. Public website availability does not establish a released training-data license.
