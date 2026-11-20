function result = run_smoke_test(toolbox_path)
%RUN_SMOKE_TEST Execute a tiny, explicit 5 MHz k-Wave reference experiment.
% The paper preset is 50 MHz. This small validation example is intentionally
% 5 MHz so it can run quickly; the change is recorded in the scene/config.
if nargin>0,addpath(toolbox_path);end
here=fileparts(mfilename('fullpath'));root=fileparts(here);
scene=fullfile(root,'examples','kwave-smoke-scene.json');
options=struct('roi_mm',1,'center_mm',[0.75,0.75], ...
    'scan_count',2,'scan_span_mm',0.3,'aperture_mm',0.6, ...
    'points_per_wavelength',3,'pml_size',8,'max_grid_points',2e6);
result=run_kwave_raster(scene,fullfile(root,'output','kwave-smoke'),options);
assert(all(isfinite(result.rf_clean(:))) && max(abs(result.rf_clean(:)))>0);
assert(isequal(size(result.map_shape),[2,2]));
assert(result.metadata.kwave_executed && strcmp(result.metadata.engine,'k-Wave-3D-raster-reference'));
assert(max(result.time_s)>1e-6 && all(diff(result.time_s)>0));
fprintf('PASS: 3D propagation, finite receiver, four raster positions, RF export and MAP.\n');
end
