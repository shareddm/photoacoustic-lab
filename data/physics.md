# Physics and model assumptions

## Scope

Photoacoustic Lab is an educational reduced-order simulator. A 2D vessel reference is assigned absorber weights and one synthetic depth per pixel. The browser then generates receiver signals and reconstructs a volume. These signals are simulated, not experimental recordings, and the browser does not run k-Wave.

The paper preset is based on Amir Asadollahi, Hamid Latifi, Shahriar Zeynali, Manojit Pramanik and Hamed Qazvini, *Accuracy of peak-power compensation in fiber-guided and free-space acoustic-resolution photoacoustic microscopy*, Biomedical Optics Express 13(3), 1774–1783 (2022), DOI [10.1364/BOE.453475](https://doi.org/10.1364/BOE.453475). Its methods report 50 MHz, 532 nm and 8 ns. The simulator's bandwidth, focus, acoustic NA and medium properties remain editable assumptions. Generic array presets are not hardware specifications from that paper.

## Initial pressure and light

The initial pressure on the assigned sheet is

```text
p0(x,y) = Gamma * mu_a(lambda,sO2,Hb) * F0 * exp(-mu_eff * depth(x,y)) * weight(x,y).
```

The implementation converts absorption from cm^-1 to m^-1 and fluence from mJ/cm2 to J/m2 before calculating Pa. Heat conversion is assumed efficient and the response linear. `weight` is a relative absorber multiplier, not an independently measured concentration. With the default brighter-means-weaker convention, `weight = 1 - input_reference`.

Hemoglobin absorption is a mixture of oxygenated and deoxygenated extinction coefficients from [OMLC](https://omlc.org/spectra/hemoglobin/summary.html), sampled at 532, 660, 700, 750, 800, 850, 900 and 940 nm. The conversion is `mu_a[cm^-1] = 2.303 * Hb[g/L]/64500 * (sO2*epsilon_oxy + (1-sO2)*epsilon_deoxy)`. Intermediate programmatic values use sparse linear interpolation. Tissue effective optical attenuation is user-assigned and constant across wavelengths; the browser has no optical scattering solver. Water uses zero optical attenuation in this simplified model.

The incident laser is a Gaussian temporal intensity with the selected FWHM and integrated surface fluence. Its peak is at t=0. Laser intensity is stored in MW/cm2 and laser time in microseconds. Integrating intensity over nanoseconds yields mJ/cm2 numerically. A pulse duration comparable to the source transit time limits the instantaneous-initial-pressure approximation.

## Acoustic signals

The browser uses Gaussian-modulated sinusoidal packets, with approximate source-thickness and pulse-duration broadening. A convenient description for array mode is

```text
s_j(t) = sum_i a_i * G_ji * h(t - tau_ji) + noise_j(t)
tau_ji = water_path_ji / c_water + tissue_path_ji / c_tissue.
```

Paths are straight and one-way. There is no pulse-echo factor of two. The source is in tissue at positive Z; a receiver can be in water at negative Z. The straight segment is divided into water/tissue portions without modeling refraction. Generic defaults are c_water=1480 m/s and c_tissue=1540 m/s. Attenuation is frequency dependent and geometric spreading approximates 1/r. Array emitters represent pixel area, and weights <=0.015 are omitted to bound computation.

Receivers use identical approximate temporal responses. Array elements are ideal omnidirectional points. The model excludes the real prism combiner, measured lens transfer, electrical impulse response and calibrated sensitivity. It is not the full photoacoustic Green's function or wave-equation solution. RF amplitudes are therefore relative receive units even though the assigned source p0 is in Pa.

Raster mode additionally approximates a focused detector with a Gaussian spatial response, focal FWHM approximately `0.71 * acoustic_wavelength / NA`, and depth-dependent defocus. Eight depth bins approximate spatial blur. Noise is seeded. Raster pulse jitter varies by scan shot; simultaneous array channels share one pulse jitter factor.

## Scan geometries

| Type | Placement and main limitation |
| --- | --- |
| Raster | Receiver visits the X–Y grid above the sample; each trace provides axial information. Focus and spatial sampling limit the image. |
| Linear | A line along X above the sample. Elevation Y is poorly constrained; one line does not uniquely provide an arbitrary 3D scene. |
| Curved | An arc in X–Z around the assigned mean depth. Wider angular coverage in that plane still leaves poor elevation localization. |
| Ring | A circle in X–Y at mean source depth. An in-plane ring has ambiguity for out-of-plane sources. |
| Matrix | A rectangular 2D array above the sample. It samples elevation but remains one-sided and can be sparse. |
| Hemisphere | Upper-hemisphere points around the sample center. Angular coverage is broader but not a closed full sphere. |

The stored coordinates are authoritative. Do not assume every array is on a planar surface or that its list order is a square grid. At a 50 mm field, coarse image grids and low receiver counts can be far from adequate acoustic spatial sampling. The UI reports these limitations; changing the display threshold does not repair them.

## Reconstruction and validation

Raster volumes are obtained from Hilbert envelopes sampled at one-way depth times. Array volumes use a matched packet filter and delay-and-sum with geometric spreading compensation and positivity. Optical fluence and acoustic attenuation are not quantitatively inverted. The reconstruction's depth interval is assigned from the phantom; it is not a blind anatomical depth estimate.

All three orthogonal views are maxima of the reconstructed volume. The assigned phantom is displayed only when explicitly selected. A MAP discards depth; several different 3D source distributions can explain one 2D projection. High similarity to an input reference under the same approximate model is not evidence of experimental fidelity or transfer to a real instrument.

The separate MATLAB reference uses the original [k-Wave toolbox](https://github.com/ucl-bug/k-wave) for a small cropped 3D raster experiment with an ideal equivalent bowl. It is raster-only, computationally limited, and still does not calibrate the full paper instrument. A top-view image should not be passed directly to a 2D acoustic solver as if the X–Y projection were an X–Z section. Future full-wave array work must use the receiver coordinates and suitable 3D source and medium models.

For reconstruction steps, target definitions, data splits and ML inputs, see [reconstruction_guide.md](reconstruction_guide.md).
