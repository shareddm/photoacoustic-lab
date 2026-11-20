# Photoacoustic Lab — v1.1

[Open Photoacoustic Lab](https://shareddm.github.io/photoacoustic-lab/) · [Source repository](https://github.com/shareddm/photoacoustic-lab)

A browser-based 3D photoacoustic imaging and microscopy workbench for education and paired synthetic-data generation. Static HTML/CSS/JavaScript, suitable for GitHub Pages, with a separate MATLAB k-Wave raster reference runner. No npm installation is needed for the interface.

## Public demo and dataset status

The public site offers **50 fixed procedural vessel images, seeds 1–50**. They are resampled from canonical 128 × 128 images so changing scan resolution preserves the same underlying phantom. These are synthetic educational demos. The source vessel dataset and simulated data files are not included in this repository.

**The dataset will be available after publication of the accompanying paper. Download buttons are intentionally disabled until then.** A completed scan never enables the public download button. The future ZIP exporter is prepared for paired 2D PNG images, exact floating-point image arrays, clean/noisy PA signals, time axes, receiver coordinates, settings, and the following guides inside its `data/` folder:

- [Data README and array contract](data/README.md)
- [Physics and model assumptions](data/physics.md)
- [Reconstruction guide for raster and array configurations](data/reconstruction_guide.md)

The documentation describes the future package, rather than announcing a released dataset. The browser approximation is intended for education and exploring machine learning dataset design and photoacoustic image reconstruction. It is not a validated replacement for measured data or full-wave simulation.

## Contact

For questions about Photoacoustic Lab or the dataset, contact Shahriar Zeynali at [szeynali@purdue.edu](mailto:szeynali@purdue.edu).

## Open it

Open **docs/index.html** in a modern browser, or run `npm start` from this folder and visit `http://127.0.0.1:8765`. All image processing and simulations happen on the device. Images are not uploaded to a server.

1. Choose a demo image from 1–50, use Next image, or load a PNG/JPEG/WebP/BMP image locally.
2. Select the grayscale convention. The default follows the requested interpretation: **brighter means weaker signal**. White therefore maps to zero absorber weight. Brightness does not determine a measured depth.
3. Set physical field size (default 50 x 50 mm), assigned depth, scan configuration, medium, receiver and laser parameters.
4. Press **Scan** or **Apply & scan**. Changes remain pending until then.
5. Rotate the 3D reconstruction, inspect the three orthogonal maximum-amplitude projections, and select an A-line or receiver channel in the oscilloscope.
6. Read the data and reconstruction guides. Public data downloads remain intentionally disabled until the accompanying paper is published.

The input is resampled to the selected square image grid. Rectangular inputs are stretched to square and that operation is recorded. Original input files are never overwritten.

## Version 1.1 interface

- The application is named **Photoacoustic Lab**, with the version line `PHOTOACOUSTICS / v1.1`.
- The header's Light mode / Dark mode button switches the workspace, 3D view, projections and schematic, and remembers the choice in browser storage. The oscilloscope screen retains its dark instrument display. Switching themes does not rerun or change the simulation.
- A citation banner stays at the top while scrolling, credits all five authors, and includes the clickable DOI `10.1364/BOE.453475`.
- The main viewer shows a rotatable 3D reconstruction. The right column contains X–Y, Y–Z and Z–X maximum-amplitude projections from that same reconstructed volume.
- A separate viewer option displays the **assigned phantom**, clearly distinguished from reconstruction.
- The oscilloscope shows the laser pulse above the delayed PA signal on the same absolute time axis. Full-event and PA-detail views are available. In detail view the laser can be outside the visible interval and is labeled accordingly.
- A horizontal parameter panel sits below the instrument display.
- Ground truth appears beside an original vector schematic adapted from the paper's raster microscopy architecture. The schematic is conceptual, not a calibrated optical or acoustic model. Array coordinates are shown in the 3D viewer.

The threshold and optional 8x depth stretch are display controls. They do not change the source, reconstruction, coordinates or exported RF. Projections are maximum-amplitude projections, not anatomical sections. The display uses a global amplitude scale. Oscilloscope channels autoscale vertically and report their peaks; RF data are never individually normalized.

## Acquisition configurations

| Configuration | Geometry | Generic preset |
| --- | --- | --- |
| Single detector / raster | One focused receiver visits every X–Y pixel center above the sample | 50 MHz |
| Linear array | Line along X at field-center Y, Z = negative water path | 7.5 MHz |
| Curved array | Receiver arc in X–Z, centered at the assigned mean depth | 5 MHz |
| Circular ring | Circle in X–Y at the assigned mean source depth | 5 MHz |
| Planar matrix | Rectangular X–Y receiver grid above the sample | 5 MHz |
| Hemisphere | Fibonacci-distributed points on the upper hemisphere around the field center and mean source depth | 2.5 MHz |

Selecting a configuration loads its generic frequency and announces the change. Other parameters remain editable; Scan applies them. These generic array presets are not commercial hardware specifications from the paper.

Linear/curved arrays have poor elevation localization. A single in-plane ring has out-of-plane ambiguity. Sparse elements and coarse image sampling cause artifacts. The application reports these limits rather than treating every configuration as equivalent.

For the curved array, ring and hemisphere, the span control means diameter. The water-path control applies to raster, linear and matrix arrangements; the other arrangements derive their vertical positions from their radius and center. Focus and NA apply only to the focused raster model.

## Models and assumptions

| Engine | Where | Calculation |
| --- | --- | --- |
| `analytic-raster-surrogate` | Browser / Node.js | Gaussian spatial response and band-limited packets, followed by Hilbert-envelope depth mapping |
| `analytic-array-surrogate` | Browser / Node.js | Packets propagated to receiver coordinates, matched filtering and 3D delay-and-sum |
| `k-Wave-3D-raster-reference` | MATLAB with separately installed k-Wave | 3D wave propagation on a small cropped phantom, ideal finite bowl reception, envelope MAP |

**The browser does not execute k-Wave.** MATLAB calculations require a separate runtime. The included MATLAB reference accepts raster scenes only and rejects array scenes explicitly.

A top-view MAP has discarded time/depth information. It does not uniquely determine 3D vessel geometry, optical absorption, illumination, detector response or original A-lines. Here it defines relative absorber weights. A plane or smooth depth map and Gaussian axial thickness define one possible synthetic absorbing sheet. Depth is assigned independently of grayscale.

The browser uses:

- `p0 = Gamma * mu_a * surface_fluence * exp(-mu_eff * depth)`, with SI conversion before calculating initial pressure in Pa.
- Hemoglobin absorption from eight exact OMLC oxygenated/deoxygenated extinction samples. Mixture: `mu_a [cm^-1] = 2.303 * Hb[g/L]/64500 * (sO2 * epsilon_oxy + (1-sO2) * epsilon_deoxy)`.
- Supported wavelength knots: 532, 660, 700, 750, 800, 850, 900 and 940 nm. Programmatic intermediate values use sparse linear interpolation; extrapolation is rejected.
- An assumed effective tissue optical attenuation that remains constant across wavelengths. Water uses zero optical attenuation in this simplified model. No optical scattering solver is used.
- Gaussian-modulated sinusoidal packets, with approximate source-thickness / pulse-duration broadening, geometric spreading and frequency-dependent acoustic attenuation. This is not the full photoacoustic source Green's function.
- A Gaussian lateral PSF for raster scans, with focal FWHM `0.71 * acoustic_wavelength / NA`. Eight assigned-depth bins approximate depth-dependent spatial blur. Hilbert-envelope A-lines are sampled at one-way depth times for the volume.
- Pixel-area-weighted point emitters for arrays; weights <=0.015 are omitted to bound cost. Ideal omnidirectional point receivers have identical temporal responses. Straight paths are split into water/tissue portions without refraction. Matched-filter delay-and-sum applies geometric spreading compensation and positivity; it does not invert attenuation.
- One shared laser-amplitude jitter factor across simultaneous array receivers; independent electronic noise. Raster shots have independent pulse factors. Seeds are recorded.

Laser intensity is Gaussian in time and integrates to the selected fluence. Its time origin is zero. The oscilloscope RF peak time is a peak of the clean waveform, not a validated first-arrival estimate. The 3D evaluation interval is assigned from the phantom's depth range; the browser is not estimating an unconstrained anatomical volume.

RF is in **relative receive units**, not calibrated pressure or voltage. Display metrics compare globally normalized absorber weights with the normalized reconstructed X–Y projection. They assess shape under this model, not absolute amplitude fidelity or experimental performance. Blank illumination with noise enabled can produce a noise-only image.

At 50 mm / 64 pixels, lateral pitch is 781.25 micrometers, far coarser than the assumed 50 MHz focus. The app flags this and does not infer missing micron-scale structure. Sparse arrays can produce pronounced reconstruction artifacts.

## Paper and parameter provenance

Amir Asadollahi, Hamid Latifi, Shahriar Zeynali, Manojit Pramanik, and Hamed Qazvini. *Accuracy of peak-power compensation in fiber-guided and free-space acoustic-resolution photoacoustic microscopy*. Biomedical Optics Express 13(3), 1774–1783 (2022). [DOI](https://doi.org/10.1364/BOE.453475), [archived full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC8973166/).

The paper's section 2 establishes the Olympus V214-BB-RM, 50 MHz center frequency, a 532 nm / 8 ns laser with 1–5 kHz repetition, and total 48 dB amplification. Amplification is recorded as provenance, not used as calibrated receive sensitivity. The archived methods establish the hardware preset. The public demo uses procedural phantoms.

| Other setting | Default | Status |
| --- | --- | --- |
| Field | 50 x 50 mm | User assumption |
| Receive bandwidth | 70% amplitude FWHM / center frequency | Editable assumption |
| Focus / NA | 1 mm under surface / 0.25 | Editable Gaussian-focus assumption |
| Mean depth / variation | 1 mm / 0.8 mm peak-to-peak | Assigned synthetic depth |
| Water coupling | 3 mm for raster/linear/matrix | Assumption |
| Tissue | c=1540 m/s; alpha=0.75 dB/(MHz^1.1 cm) | Generic assumption |
| Water | c=1480 m/s; alpha=0.0022 dB/(MHz^2 cm) | Approximate room-temperature assumption |
| Tissue mu_eff | 0.5/mm | User-assigned, wavelength independent |
| Hemoglobin / oxygenation | 150 g/L / 0.7 | Assumed mixture using [OMLC data](https://omlc.org/spectra/hemoglobin/summary.html) |
| Gruneisen | 0.12 | Assumption |
| Fluence | 10 mJ/cm2 | Simulation setting, not exposure guidance |
| Axial source FWHM | 0.02 mm | Assigned Gaussian sheet |

The new schematic illustrates laser, beam splitter, photodiode monitoring, coupling lens, fiber, scanning optics, combiner, water/sample, receiver, amplification and data acquisition. It does not reproduce a measured transfer function or calibrate the paper's acoustic lens / prism assembly.

Geometry and solver references: [k-Wave 3D Cartesian sensor masks](https://www.k-wave.org/documentation/kspaceFirstOrder3D.php), [array reception example](https://www.k-wave.org/documentation/example_at_array_as_sensor.php), [planar reconstruction example](https://www.k-wave.org/documentation/example_pr_3D_fft_planar_sensor.php).

## NumPy data contract

NPZ is a standard uncompressed ZIP of NPY arrays. Load without pickle:

```python
import json
import numpy as np
d = np.load("photoacoustics-v1.1-matrix-42.npz", allow_pickle=False)
metadata = json.loads(d["metadata_utf8"].tobytes())
rf = d["rf_noisy"]
volume = d["reconstruction_volume"]  # [z, y, x], C order
assert np.array_equal(volume.max(axis=0), d["projection_xy"])
```

| Arrays | Shape / meaning |
| --- | --- |
| `input_reference`, `absorber_weight` | [y,x], resampled reference and assigned canonical weights |
| `depth_mm`, `initial_pressure_pa` | [y,x], assigned depth and pressure on the sheet |
| `rf_clean`, `rf_noisy` | Raster: [scan_y,scan_x,time]; arrays: [detector,time] |
| `time_us` | RF time axis; raster recordings crop around expected arrivals, array recordings start at zero |
| `reconstruction_volume` | [z,y,x], nonnegative reconstructed amplitude |
| `depth_axis_mm` | Physical Z coordinates of reconstructed voxels |
| `projection_xy` | [y,x], depth maximum of reconstructed volume |
| `projection_yz`, `projection_zx` | [z,y] and [z,x], maxima over X and Y |
| `map_raw`, `map_shape`, `map_display` | Legacy raster max(abs(RF)) image, or array depth-max reconstruction; normalized and grayscale-convention variants |
| `laser_time_us`, `laser_intensity_mw_cm2` | Fine laser time samples around zero, Gaussian intensity in MW/cm2 |
| `detector_positions_mm` | [detector,3], X/Y/Z positions; raster lists one reference-center position |
| `scan_x_mm`, `scan_y_mm` | Raster only: actual detector scan coordinate axes |
| `detector_peak` | Arrays only: maximum absolute RF per receiver |
| `metadata_utf8` | UTF-8 JSON bytes: version, engine, seed, config, geometry, units, assumptions and metrics |

The UI compares `projection_xy` with absorber weights; `metadata.volume_metrics` records that comparison. Legacy `metadata.metrics` in raster mode refers to its raw RF-maximum image. Laser and RF have different sample grids, but share the same time origin. Time axes and sample counts vary with parameters; pad/resample deliberately before batch training.

## Batch generation

Requires Node.js 18+; no npm packages:

```sh
node scripts/generate_dataset.cjs --count 10 --seed 100 --size 64 --out output/dataset
```

`--settings saved-settings.json` accepts the browser's exported settings, including array geometry. The manifest records seeds, hashes and phantom-level train/validation/test assignments. Small sets can have empty splits; inspect before training. Keep every augmented version of the same source geometry in its original split.

For a folder of images, using Python + Pillow + Node.js:

```sh
python3 scripts/batch_from_images.py /path/to/images --out output/imported --polarity bright-weaker
```

Use `--settings` to apply an exported experiment. Filenames and original dimensions are recorded. The importer cannot infer anatomical duplicate / patient identities from filenames.

## Actual k-Wave reference

Install MATLAB and the [original k-Wave toolbox](https://github.com/ucl-bug/k-wave) separately. The k-Wave-II API is not used. From this project in MATLAB:

```matlab
addpath('/path/to/k-wave/k-Wave');
addpath('matlab');
result = run_smoke_test();
```

The included smoke scene explicitly uses **5 MHz**, a 1.5 mm field, a 1 mm source ROI, 0.6 mm water path and four raster positions. It is a manageable code-execution test, not a replication of the full paper setup.

For a raster scene exported by the browser:

```matlab
options = struct('roi_mm',0.3,'scan_count',3, ...
    'scan_span_mm',0.1,'center_mm',[25,25]);
result = run_kwave_raster('scene.json','output/reference',options);
```

Choose shallow assigned sources, a small field/crop, and a short water path. A 50 MHz 3D grid for a full 50 x 50 mm field can be very large. The runner estimates grid size before allocation and rejects runs over budget instead of changing frequency silently. The chosen grid resolves the upper half-maximum frequency at >=3 points per wavelength; spectral tails and source thickness still need convergence testing.

The MATLAB model uses a finite-thickness Gaussian sheet, a water/tissue interface, an ideal equivalent bowl, temporal receive filtering and a Gaussian laser profile. It coherently averages pressure across the bowl, adds noise and computes a Hilbert-envelope MAP. Layered tissue mode neglects water absorption because it uses one attenuation exponent. It excludes the actual optical combiner, acoustic lens transfer, electronics and calibrated sensitivity.

Outputs: `kwave_result.mat`, `metadata.json`, `map_shape.png`, `target_weight.png`. These remain separate from browser surrogate datasets. Array JSON scenes are rejected by this raster runner; a future full-wave array path must simulate those receiver coordinates and reconstruct accordingly.

## Checks

`npm test` verifies deterministic phantoms/noise, fluence linearity, zero sources, spectral absorption, attenuation, one-way timing, pulse-duration effects, all five array geometries, per-receiver energy-centroid timing, localization of a 3D point source, volume projections and integrated laser energy. `npm run examples` regenerates raster and matrix NPZ examples.

The inherited MATLAB raster runner was previously executed successfully with MATLAB R2023b and k-Wave 1.4.1 for four raster positions. That verifies execution and finite nonzero signals, not scientific calibration. Browser models require experimental validation before claims about real-system performance or ML transfer. Measured A-lines, bandwidth / impulse response, and lens specifications would support calibration.

## GitHub Pages

The entire browser workbench, including 3D rendering, uses local HTML/CSS/JavaScript and an SVG. There are no external dependencies or server calls. Relative paths support project subdirectories.

Upload the project to your chosen repository. In Pages settings select **Deploy from a branch**, choose the branch and **/docs**. `.nojekyll` keeps it static. Github Pages does not execute MATLAB; only the browser approximation runs there. The public site is hosted at https://shareddm.github.io/photoacoustic-lab/. Neither the paper, the k-Wave toolbox nor the unreleased image dataset is bundled. A code license and future dataset reuse license have not yet been selected.

Search terms: photoacoustic imaging; photoacoustic microscopy; synthetic vascular dataset; machine learning; photoacoustic image reconstruction; k-Wave.

To prepare a source-only publication folder, run `npm run prepare:publication`. This excludes local examples, exports, uploaded images and computed datasets. The public website contains no tracking or third-party scripts. Disabling downloads is a release choice in the interface; browser-generated demo results cannot be treated as confidential once the computation is public.
