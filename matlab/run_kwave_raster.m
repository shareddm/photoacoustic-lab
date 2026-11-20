function result = run_kwave_raster(scene_path, output_dir, options)
%RUN_KWAVE_RASTER Reference 3D wave simulation of a SMALL raster-scan region.
% Install the original k-Wave toolbox separately and add its k-Wave folder to
% the MATLAB path. No k-Wave code is bundled in this project.
% Example: run_kwave_raster('scene.json','output',struct('scan_count',3))
% The input MAP defines an assumed Gaussian absorbing sheet, not recovered
% 3D anatomy. A finite bowl is an assumed equivalent focused receiver, not a
% measured model of the paper's acoustic lens / prism combiner.
if nargin < 3, options = struct; end
assert(exist('kspaceFirstOrder3D','file') == 2, ...
    'Add the separately installed original k-Wave toolbox to your MATLAB path.');
scene = jsondecode(fileread(scene_path));
assert(strcmp(scene.schema,'vascular-pa-scene/1'),'Unsupported scene schema.');
cfg = scene.config;
assert(~isfield(cfg,'scan_config') || strcmp(cfg.scan_config,'raster'), ...
    'This reference runner supports raster scans only. Array scenes require a separate array wave simulation and reconstruction.');
defaults = struct('roi_mm',1,'scan_count',3,'scan_span_mm',0.3, ...
    'points_per_wavelength',3,'max_grid_points',8e6,'pml_size',8, ...
    'noise_fraction',0.01,'save_volume',true);
names = fieldnames(defaults);
for j=1:numel(names)
    if ~isfield(options,names{j}), options.(names{j})=defaults.(names{j}); end
end
if isfield(options,'config_overrides')
    names=fieldnames(options.config_overrides);
    for j=1:numel(names), cfg.(names{j})=options.config_overrides.(names{j}); end
end
assert(options.roi_mm>0 && options.scan_count>=1 && options.scan_count==round(options.scan_count));
assert(options.points_per_wavelength>=3 && options.scan_span_mm>=0);
assert(cfg.center_mhz>=1 && cfg.center_mhz<=80 && cfg.bandwidth_pct>0);
n = cfg.size;
assert(numel(scene.weights)==n*n && numel(scene.depth_mm)==n*n);
% Browser arrays are C-order [scan_y,scan_x]. MATLAB columns need a transpose.
weight = reshape(single(scene.weights),[n,n]).';
depth = reshape(single(scene.depth_mm),[n,n]).';
assert(all(isfinite(weight(:))) && all(weight(:)>=0 & weight(:)<=1));
assert(all(isfinite(depth(:))) && all(depth(:)>0));
if ~isfield(options,'center_mm')
    [~,strongest]=max(weight(:));[iy,ix]=ind2sub([n,n],strongest);
    options.center_mm=([ix,iy]-0.5)*cfg.fov_mm/n;
end
assert(numel(options.center_mm)==2 && all(isfinite(options.center_mm)));
% Resolve the upper half-maximum frequency with >=3 grid points/wavelength.
% This is a practical band limit; convergence testing still matters because
% a Gaussian receiver has spectral tails outside its FWHM.
f_upper = cfg.center_mhz*1e6*(1+cfg.bandwidth_pct/200);
dx = 1480/(f_upper*options.points_per_wavelength);
radius_mm = cfg.water_path_mm + cfg.focus_depth_mm;
assert(radius_mm>0 && cfg.water_path_mm>0,'Reference bowl requires a positive water path.');
if ~isfield(options,'aperture_mm')
    options.aperture_mm = 2*radius_mm*cfg.numerical_aperture;
end
assert(options.aperture_mm>0 && options.aperture_mm<2*radius_mm);
sag_mm=radius_mm-sqrt(radius_mm^2-(options.aperture_mm/2)^2);
assert(sag_mm<cfg.water_path_mm,'The assumed bowl must fit entirely inside the water coupling layer.');
width_mm=max(options.roi_mm,options.scan_span_mm+options.aperture_mm)+8*dx*1e3;
Nx=2*ceil(width_mm*1e-3/dx/2); Ny=Nx;
source_max_mm=double(max(depth(:)));
Nz=2*ceil((cfg.water_path_mm+source_max_mm+4*cfg.source_thickness_mm+8*dx*1e3)*1e-3/dx/2);
extended = [Nx,Ny,Nz]+2*options.pml_size;
points=prod(extended);
estimate_gib=points*35*4/1024^3;
fprintf('Reference grid %d x %d x %d (+ PML): %.1f million points; rough working memory %.2f GiB\n',Nx,Ny,Nz,points/1e6,estimate_gib);
assert(points<=options.max_grid_points, ...
    ['Requested grid exceeds the configured budget. Use a smaller ROI, smaller water path/aperture, ', ...
    'or explicitly lower the center frequency for an educational test. Frequency was NOT changed.']);
assert(all(options.center_mm-options.roi_mm/2>=0) && all(options.center_mm+options.roi_mm/2<=cfg.fov_mm), ...
    'Place the ROI fully inside the input field; specify options.center_mm.');
x=((0:Nx-1)-(Nx-1)/2)*dx*1e3+options.center_mm(1);
y=((0:Ny-1)-(Ny-1)/2)*dx*1e3+options.center_mm(2);
image_axis=((0:n-1)+0.5)*cfg.fov_mm/n;
[X,Y]=ndgrid(x,y);
local_weight=interp2(image_axis,image_axis,double(weight),X,Y,'linear',0);
local_depth=interp2(image_axis,image_axis,double(depth),X,Y,'linear',NaN);
local_depth(~isfinite(local_depth))=cfg.depth_mm;
roi_mask=abs(X-options.center_mm(1))<=options.roi_mm/2 & abs(Y-options.center_mm(2))<=options.roi_mm/2;
local_weight=local_weight.*roi_mask;
apex=3; z=((1:Nz)-apex)*dx*1e3;
kgrid=kWaveGrid(Nx,dx,Ny,dx,Nz,dx);
% Keep grid sizes and input medium arrays double before k-Wave's DataCast.
% Mixed single/double grid dimensions create mismatched coordinate types.
medium.sound_speed=1480*ones(Nx,Ny,Nz);
medium.density=1000*ones(Nx,Ny,Nz);
medium.alpha_coeff=zeros(Nx,Ny,Nz);
if strcmp(cfg.medium,'tissue')
    tissue=z>=cfg.water_path_mm;
    medium.sound_speed(:,:,tissue)=1540;
    medium.density(:,:,tissue)=1050;
    medium.alpha_coeff(:,:,tissue)=0.75;
    medium.alpha_power=1.1;
    % One alpha_power per run: ignore water absorption in this layered case.
    mu_eff=cfg.mu_eff_per_mm;
else
    medium.alpha_coeff(:)=0.0022; medium.alpha_power=2; mu_eff=0;
end
mu_a=scene.mu_a_cm_inv; % Exported OMLC mixture for the selected wavelength.
assert(~isfield(options,'config_overrides') || ...
    (~isfield(options.config_overrides,'wavelength_nm') && ~isfield(options.config_overrides,'oxygenation') ...
    && ~isfield(options.config_overrides,'hb_g_l')), ...
    'Re-export the scene after changing wavelength/oxygenation/hemoglobin so absorption is recomputed.');
local_p0=cfg.gruneisen*mu_a*100*cfg.fluence_mj_cm2*10.*exp(-mu_eff*local_depth).*local_weight;
sigma_z=cfg.source_thickness_mm/2.35482;
if sigma_z<dx*1e3/2, warning('Assigned source thickness is under-resolved; increase thickness or grid resolution.'); end
source.p0=zeros(Nx,Ny,Nz,'single');
for iz=1:Nz
    source.p0(:,:,iz)=single(local_p0.*exp(-0.5*((z(iz)-cfg.water_path_mm-local_depth)/sigma_z).^2));
end
duration=(cfg.water_path_mm+source_max_mm+options.roi_mm)*1e-3/1480+0.5e-6;
kgrid.makeTime(medium.sound_speed,0.2,duration);
nt=numel(kgrid.t_array);count=options.scan_count;
if count==1, offsets=0; else, offsets=linspace(-options.scan_span_mm/2,options.scan_span_mm/2,count); end
scan_x=options.center_mm(1)+offsets;scan_y=options.center_mm(2)+offsets;
rf_clean=zeros(count,count,nt,'single');
detector_radius=round(radius_mm*1e-3/dx);
detector_diameter=2*floor(options.aperture_mm*1e-3/dx/2)+1;
assert(detector_diameter>=3,'Receiver aperture is under-resolved.');
fprintf('Running %d raster positions at %.1f MHz, dx=%.2f um, dt=%.2f ns\n',count^2,cfg.center_mhz,dx*1e6,kgrid.dt*1e9);
for iy=1:count
    for ix=1:count
        [~,gx]=min(abs(x-scan_x(ix)));[~,gy]=min(abs(y-scan_y(iy)));
        bowl_pos=[gx,gy,apex];focus=[gx,gy,apex+detector_radius];
        sensor.mask=makeBowl([Nx,Ny,Nz],bowl_pos,detector_radius,detector_diameter,focus);
        sensor.frequency_response=[cfg.center_mhz*1e6,cfg.bandwidth_pct];
        data=kspaceFirstOrder3D(kgrid,medium,source,sensor, ...
            'PMLInside',false,'PMLSize',options.pml_size,'DataCast','single', ...
            'PlotSim',false,'PlotPML',false,'Smooth',false);
        % Coherent area-average approximation: ideal equivalent receiver.
        trace=mean(data,1);
        % Gaussian laser temporal profile, unit-area; no amplitude normalization.
        f=(0:nt-1)/(nt*kgrid.dt);f(f>1/(2*kgrid.dt))=f(f>1/(2*kgrid.dt))-1/kgrid.dt;
        sigma_t=cfg.pulse_ns*1e-9/2.35482;
        trace=real(ifft(fft(double(trace)).*exp(-0.5*(2*pi*f*sigma_t).^2)));
        rf_clean(iy,ix,:)=single(trace);
    end
end
rng(cfg.seed,'twister');
noise_std=options.noise_fraction*max(abs(rf_clean(:)));
rf_noisy=rf_clean+single(noise_std*randn(size(rf_clean)));
% Toolbox-independent Hilbert envelope along time.
spec=fft(rf_noisy,[],3);H=zeros(1,1,nt,'single');H(1)=1;
if mod(nt,2)==0,H(2:nt/2)=2;H(nt/2+1)=1;else,H(2:(nt+1)/2)=2;end
map_raw=max(abs(ifft(spec.*H,[],3)),[],3);
map_shape=map_raw/max(max(map_raw(:)),eps('single'));
[SX,SY]=meshgrid(scan_x,scan_y);
target_weight=single(interp2(image_axis,image_axis,double(weight),SX,SY,'linear',0));
metadata=struct('schema','vascular-pa-lab/1','engine','k-Wave-3D-raster-reference', ...
    'kwave_executed',true,'config',cfg,'options',options,'dx_m',dx,'dt_s',kgrid.dt, ...
    'rf_axes',{{'scan_y','scan_x','time'}},'rf_units','Pa, ideal bowl area-mean pressure', ...
    'map_algorithm','maximum Hilbert envelope over time', ...
    'target','input absorber weight at scan positions; not original 3D anatomy', ...
    'receiver','assumed equivalent bowl; excludes the real combiner, lens transfer, electronics and absolute sensitivity', ...
    'optical_model','Beer-Lambert effective attenuation; no optical scattering solver', ...
    'water_absorption_note','Ignored in layered tissue mode; water-only uses 0.0022 dB/(MHz^2 cm)', ...
    'noise_std_pa',noise_std,'shape_mse',mean((target_weight(:)-map_shape(:)).^2), ...
    'matlab_version',version,'source_scene',scene.schema);
result=struct('rf_clean',rf_clean,'rf_noisy',rf_noisy,'time_s',kgrid.t_array, ...
    'map_raw',map_raw,'map_shape',map_shape,'target_weight',target_weight, ...
    'scan_x_mm',scan_x,'scan_y_mm',scan_y,'metadata',metadata);
if options.save_volume,result.initial_pressure_pa=source.p0;end
if ~exist(output_dir,'dir'),mkdir(output_dir);end
save(fullfile(output_dir,'kwave_result.mat'),'-struct','result','-v7.3');
fid=fopen(fullfile(output_dir,'metadata.json'),'w');assert(fid>=0);closer=onCleanup(@()fclose(fid));
fprintf(fid,'%s',jsonencode(metadata,'PrettyPrint',true));clear closer;
imwrite(map_shape,fullfile(output_dir,'map_shape.png'));
imwrite(target_weight,fullfile(output_dir,'target_weight.png'));
fprintf('Saved actual k-Wave results to %s\n',output_dir);
end
