/* Vascular PA Lab: transparent, reduced-order raster-scan model. No k-Wave runs here. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PALab = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '1.1.0';
  // Exact samples from Scott Prahl's OMLC table, cm^-1 M^-1. Interpolation between knots.
  const HB = [[532,43876,40584],[660,319.6,3226.56],[700,290,1794.28],
    [750,518,1405.24],[800,816,761.72],[850,1058,691.32],[900,1198,761.84],[940,1214,693.44]];
  const DEFAULTS = Object.freeze({size:64, seed:42, fov_mm:50, polarity:'bright-weaker',
    depth_mm:1, depth_span_mm:0.8, depth_mode:'undulating', medium:'tissue',
    center_mhz:50, bandwidth_pct:70, wavelength_nm:532, pulse_ns:8, fluence_mj_cm2:10,
    oxygenation:0.7, hb_g_l:150, gruneisen:0.12, mu_eff_per_mm:0.5,
    water_path_mm:3, focus_depth_mm:1, numerical_aperture:0.25,
    source_thickness_mm:0.02, noise_rms:0.0002, pulse_jitter_pct:0,
    scan_config:'raster',element_count:64,array_aperture_mm:60,arc_angle_deg:120});
  const SCANS = Object.freeze({
    raster:{label:'Single detector · raster',frequency:50,description:'A focused detector scans the x–y field. Depth follows each A-line.'},
    linear:{label:'Linear array',frequency:7.5,description:'A line of point receivers above the sample. Elevation is poorly constrained.'},
    arc:{label:'Curved array',frequency:5,description:'A receiver arc in the x–z plane. Elevation remains poorly constrained.'},
    ring:{label:'Circular ring',frequency:5,description:'A ring around the sample at the mean source depth. Out-of-plane depth is ambiguous.'},
    matrix:{label:'Planar matrix array',frequency:5,description:'A two-dimensional receiver grid above the sample.'},
    hemisphere:{label:'Hemispherical array',frequency:2.5,description:'Point receivers distributed on the upper hemisphere around the sample.'}
  });
  const PAPER = {doi:'10.1364/BOE.453475', url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC8973166/',
    transducer:'Olympus V214-BB-RM', center_mhz:50, wavelength_nm:532, pulse_ns:8,
    repetition_khz:[1,5], amplifier_gain_db:48,
    not_established:['receive bandwidth','acoustic lens NA/focus','absolute receive sensitivity','DAQ rate'],
    note:'External acoustic lens and opto-acoustic combiner reported. Browser uses an assumed Gaussian focus, not their measured lens.'};
  function rng(seed) { let a=seed>>>0; return function(){a+=0x6D2B79F5;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}; }
  function normal(r) { return Math.sqrt(-2*Math.log(Math.max(r(),1e-12)))*Math.cos(2*Math.PI*r()); }
  const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
  function normalize(a) { let m=0;for(const x of a)m=Math.max(m,Math.abs(x));return Float32Array.from(a,x=>m?x/m:0); }
  function bloodAbsorption(wavelength,so2=0.7,hb=150) {
    if(wavelength<532 || wavelength>940) throw Error('Supported wavelengths: 532–940 nm.');
    let j=0;while(j<HB.length-2 && HB[j+1][0]<wavelength)j++;
    const t=(wavelength-HB[j][0])/(HB[j+1][0]-HB[j][0]);
    const oxy=HB[j][1]+t*(HB[j+1][1]-HB[j][1]);
    const deoxy=HB[j][2]+t*(HB[j+1][2]-HB[j][2]);
    return 2.303*hb/64500*(so2*oxy+(1-so2)*deoxy);
  }
  function generateVessels(n,seed=42) {
    const r=rng(seed), image=new Float32Array(n*n);
    function stamp(x,y,width,strength) {
      const radius=Math.max(0.5,width), reach=Math.ceil(radius*2.5);
      for(let yy=Math.max(0,Math.floor(y-reach));yy<=Math.min(n-1,Math.ceil(y+reach));yy++)
        for(let xx=Math.max(0,Math.floor(x-reach));xx<=Math.min(n-1,Math.ceil(x+reach));xx++) {
          const v=strength*Math.exp(-((xx-x)**2+(yy-y)**2)/(2*radius*radius));
          image[yy*n+xx]=Math.max(image[yy*n+xx],v);
        }
    }
    function branch(x,y,angle,length,width,level,strength) {
      const steps=Math.ceil(length*2.5), turn=(r()-0.5)*0.9;
      for(let s=0;s<steps;s++) { angle+=turn/steps+(r()-0.5)*0.025;
        x+=Math.cos(angle)/2.5;y+=Math.sin(angle)/2.5;stamp(x,y,width,strength);
        if(x<0 || y<0 || x>n-1 || y>n-1)break;
      }
      if(level>0 && x>0 && y>0 && x<n && y<n) {
        branch(x,y,angle-0.35-r()*0.5,length*(0.58+r()*0.14),width*0.66,level-1,strength*(0.8+r()*0.18));
        branch(x,y,angle+0.35+r()*0.5,length*(0.58+r()*0.14),width*0.66,level-1,strength*(0.8+r()*0.18));
      }
    }
    branch(n*.08,n*.9,-1.0,n*.44,n*.022,4,1);
    branch(n*.94,n*.12,2.1,n*.35,n*.016,4,.85);
    branch(n*.9,n*.9,-2.3,n*.27,n*.014,3,.75);
    return normalize(image);
  }
  function referenceFromWeights(w,polarity) { return Float32Array.from(w,x=>polarity==='bright-weaker'?1-x:x); }
  function demoWeights(n,seed){
    if(!Number.isInteger(seed)||seed<1||seed>50)throw Error('The public demo contains images 1–50.');
    const base=128,image=generateVessels(base,seed),out=new Float32Array(n*n);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const px=clamp((x+.5)*base/n-.5,0,base-1),py=clamp((y+.5)*base/n-.5,0,base-1),x0=Math.floor(px),y0=Math.floor(py),x1=Math.min(base-1,x0+1),y1=Math.min(base-1,y0+1),a=px-x0,b=py-y0;
      out[y*n+x]=image[y0*base+x0]*(1-a)*(1-b)+image[y0*base+x1]*a*(1-b)+image[y1*base+x0]*(1-a)*b+image[y1*base+x1]*a*b;
    }
    return out;
  }
  function weightsFromReference(ref,polarity) { return Float32Array.from(ref,x=>polarity==='bright-weaker'?1-x:x); }
  function depthMap(n,cfg) {
    const out=new Float32Array(n*n),phase=rng(cfg.seed+781)()*Math.PI*2;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)out[y*n+x]=cfg.depth_mm+
      (cfg.depth_mode==='plane'?0:cfg.depth_span_mm/2*Math.sin(x/n*2*Math.PI+phase)*Math.cos(y/n*2*Math.PI));
    return out;
  }
  function blur(input,n,sigma) {
    if(sigma<0.12)return Float32Array.from(input);
    const radius=Math.min(n-1,Math.ceil(3*sigma)), k=[];let sum=0;
    for(let i=-radius;i<=radius;i++){const v=Math.exp(-i*i/(2*sigma*sigma));k.push(v);sum+=v;}
    for(let i=0;i<k.length;i++)k[i]/=sum;
    const tmp=new Float32Array(n*n),out=new Float32Array(n*n);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(let j=-radius;j<=radius;j++) {
      const xx=x+j;if(xx>=0&&xx<n)tmp[y*n+x]+=input[y*n+xx]*k[j+radius];
    }
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(let j=-radius;j<=radius;j++) {
      const yy=y+j;if(yy>=0&&yy<n)out[y*n+x]+=tmp[yy*n+x]*k[j+radius];
    }
    return out;
  }
  function validate(cfg) {
    const ranges={size:[8,96],seed:[0,2147483647],fov_mm:[0.1,100],depth_mm:[0.01,20],depth_span_mm:[0,10],
      center_mhz:[1,80],bandwidth_pct:[10,150],wavelength_nm:[532,940],pulse_ns:[0.1,200],
      fluence_mj_cm2:[0,100],oxygenation:[0,1],hb_g_l:[1,250],gruneisen:[0.001,1],
      mu_eff_per_mm:[0,10],water_path_mm:[0,50],focus_depth_mm:[0,20],numerical_aperture:[0.02,0.8],
      source_thickness_mm:[0.001,1],noise_rms:[0,1],pulse_jitter_pct:[0,50],
      element_count:[8,256],array_aperture_mm:[0.2,150],arc_angle_deg:[20,170]};
    for(const [k,[lo,hi]] of Object.entries(ranges))if(!Number.isFinite(cfg[k])||cfg[k]<lo||cfg[k]>hi)throw Error(`${k} must be between ${lo} and ${hi}.`);
    if(!Number.isInteger(cfg.size)||!Number.isInteger(cfg.seed))throw Error('Raster size and seed must be integers.');
    if(!SCANS[cfg.scan_config]||!Number.isInteger(cfg.element_count))throw Error('Choose a supported scan and an integer element count.');
    if(!['water','tissue'].includes(cfg.medium)||!['plane','undulating'].includes(cfg.depth_mode)||!['bright-weaker','bright-stronger'].includes(cfg.polarity))throw Error('Unsupported model option.');
    if(cfg.depth_mode!=='plane' && cfg.depth_mm<=cfg.depth_span_mm/2)throw Error('Depth must exceed half the depth variation.');
  }
  function metrics(reference,observed) {
    let mx=0,my=0,mse=0;const n=reference.length;
    for(let i=0;i<n;i++){mx+=reference[i]/n;my+=observed[i]/n;mse+=(reference[i]-observed[i])**2/n;}
    let vx=0,vy=0,cov=0;
    for(let i=0;i<n;i++){vx+=(reference[i]-mx)**2/n;vy+=(observed[i]-my)**2/n;cov+=(reference[i]-mx)*(observed[i]-my)/n;}
    return {normalized_mse:mse,global_ssim:((2*mx*my+.0001)*(2*cov+.0009))/((mx*mx+my*my+.0001)*(vx+vy+.0009)),
      correlation:vx*vy>0?cov/Math.sqrt(vx*vy):null};
  }
  function simulate(reference,options={},sourceInfo={kind:'procedural'}) {
    const cfg={...DEFAULTS,...options};validate(cfg);const n=cfg.size,np=n*n;
    if(reference.length!==np || Array.from(reference).some(x=>!Number.isFinite(x)||x<0||x>1))throw Error('Image must contain raster-size squared intensities in [0,1].');
    if(cfg.scan_config!=='raster')return simulateArray(reference,cfg,sourceInfo);
    const weights=weightsFromReference(reference,cfg.polarity), depths=depthMap(n,cfg);
    const soundSpeed=cfg.medium==='water'?1480:1540, c=soundSpeed/1000,cw=1.48;
    const muA=bloodAbsorption(cfg.wavelength_nm,cfg.oxygenation,cfg.hb_g_l);
    const p0=new Float32Array(np),alpha=cfg.medium==='water'?.0022:.75, power=cfg.medium==='water'?2:1.1;
    const muEff=cfg.medium==='water'?0:cfg.mu_eff_per_mm;
    let minDepth=Infinity,maxDepth=0;for(const d of depths){minDepth=Math.min(minDepth,d);maxDepth=Math.max(maxDepth,d);}
    const fs=Math.ceil(8*cfg.center_mhz/10)*10; // MHz = samples/us, deliberately oversampled
    const sigmaDetector=1/(2*Math.PI*(cfg.center_mhz*cfg.bandwidth_pct/100/2.35482));
    const sigmaSource=Math.hypot(cfg.pulse_ns/1000/2.35482,cfg.source_thickness_mm/c/2.35482);
    const sigmaTotal=Math.hypot(sigmaDetector,sigmaSource);
    const omega=2*Math.PI*cfg.center_mhz*sigmaDetector**2/sigmaTotal**2;
    const pulseGain=sigmaDetector/sigmaTotal*Math.exp(-0.5*(2*Math.PI*cfg.center_mhz)**2*sigmaDetector**2*sigmaSource**2/sigmaTotal**2);
    const margin=Math.max(.15,6*sigmaTotal),t0=cfg.water_path_mm/cw+minDepth/c-margin;
    const duration=(maxDepth-minDepth)/c+2*margin;
    const nt=2**Math.ceil(Math.log2(Math.max(64,Math.ceil(duration*fs))));
    if(np*nt>25000000)throw Error('This combination is too large for the browser. Reduce raster size or depth variation.');
    const time=Float64Array.from({length:nt},(_,i)=>t0+i/fs);
    const clean=new Float32Array(np*nt),noisy=new Float32Array(np*nt),map=new Float32Array(np);
    for(let i=0;i<np;i++)p0[i]=cfg.gruneisen*muA*100*cfg.fluence_mj_cm2*10*Math.exp(-muEff*depths[i])*weights[i];
    // Quantize synthetic depth only for the spatial PSF. Arrival times remain continuous per source pixel.
    const wavelengthMm=c/cfg.center_mhz,waist=.71*wavelengthMm/cfg.numerical_aperture/2.35482;
    const rayleigh=Math.PI*waist*waist/wavelengthMm;
    const fwhm=.71*wavelengthMm/cfg.numerical_aperture;
    const binCount=maxDepth-minDepth<1e-5?1:8,spread=maxDepth-minDepth;
    const ampBins=Array.from({length:binCount},()=>new Float32Array(np));
    const weightedDepth=Array.from({length:binCount},()=>new Float32Array(np));
    for(let i=0;i<np;i++) {
      const b=Math.min(binCount-1,Math.floor((depths[i]-minDepth)/(spread||1)*binCount));
      const tissueLoss=alpha*(omega/(2*Math.PI))**power*(depths[i]/10);
      const waterLoss=.0022*(omega/(2*Math.PI))**2*cfg.water_path_mm/10;
      const amplitude=p0[i]/1e5/(cfg.water_path_mm+depths[i])*10**(-(tissueLoss+waterLoss)/20)*pulseGain;
      ampBins[b][i]=amplitude;weightedDepth[b][i]=amplitude*depths[i];
    }
    for(let b=0;b<binCount;b++) {
      const z=minDepth+(b+.5)*(spread/binCount), defocus=Math.sqrt(1+((z-cfg.focus_depth_mm)/rayleigh)**2);
      const sigmaPx=fwhm*defocus/2.35482/(cfg.fov_mm/n);
      const amplitudes=blur(ampBins[b],n,sigmaPx),zWeighted=blur(weightedDepth[b],n,sigmaPx);
      for(let i=0;i<np;i++) {
        const amp=amplitudes[i];if(amp<1e-15)continue;
        const zLocal=zWeighted[i]/amp,arrival=cfg.water_path_mm/cw+zLocal/c;
        const first=Math.max(0,Math.floor((arrival-6*sigmaTotal-t0)*fs));
        const last=Math.min(nt-1,Math.ceil((arrival+6*sigmaTotal-t0)*fs));
        for(let t=first;t<=last;t++) {const dt=time[t]-arrival;clean[i*nt+t]+=amp*Math.exp(-dt*dt/(2*sigmaTotal*sigmaTotal))*Math.sin(omega*dt);}
      }
    }
    const random=rng(cfg.seed+16607);let cleanPeak=0;
    for(let i=0;i<np;i++) {
      const jitter=Math.max(0,1+cfg.pulse_jitter_pct/100*normal(random));let peak=0;
      for(let t=0;t<nt;t++) {const j=i*nt+t;noisy[j]=clean[j]*jitter+cfg.noise_rms*normal(random);peak=Math.max(peak,Math.abs(noisy[j]));cleanPeak=Math.max(cleanPeak,Math.abs(clean[j]));}
      map[i]=peak;
    }
    const shape=normalize(map), comparison=metrics(weights,shape),warnings=[];
    if(cfg.fov_mm/n>fwhm/2)warnings.push(`Coarse raster: ${(cfg.fov_mm/n*1000).toFixed(0)} µm pitch; assumed focal FWHM ${Math.round(fwhm*1000)} µm. Fine vessels are not spatially resolved.`);
    if(cfg.pulse_ns/1000>cfg.source_thickness_mm/c/3)warnings.push('Pulse duration is not much shorter than the assumed source transit time; the pulse-broadening model is approximate.');
    if(sourceInfo.kind==='upload')warnings.push('Input is a resampled MAP reference. Depth and absorption are assigned assumptions; original A-lines cannot be recovered uniquely.');
    warnings.push('RF amplitudes use an arbitrary receive scale. They are not calibrated pressure or voltage.');
    const result={cfg,n,nt,time,reference:Float32Array.from(reference),weights,depths,p0,clean,noisy,map,shape,
      displayMap:referenceFromWeights(shape,cfg.polarity),metrics:comparison,
      metadata:{schema:'vascular-pa-lab/1',version:VERSION,engine:'analytic-raster-surrogate',kwave_executed:false,
        config:cfg,source:sourceInfo,array_order:'C',rf_axes:['scan_y','scan_x','time'],rf_units:'arbitrary_receive_units',
        map_algorithm:'max(abs(rf_noisy), time)',shape_normalization:'one global maximum per complete MAP; RF is never trace-normalized',
        depth_assumption:'one synthetic absorbing sheet per pixel, not recovered anatomy',
        receiver_model:'Gaussian spatial PSF plus Gaussian-modulated sinusoidal packet; no full wave solver, no reflections or refraction',
        sound_speed_m_s:soundSpeed,mu_a_cm_inv:muA,sample_rate_mhz:fs,time_start_us:t0,
        focal_fwhm_mm:fwhm,clean_peak_au:cleanPeak,metrics:comparison,warnings,
        optical_source:'https://omlc.org/spectra/hemoglobin/summary.html',spectral_interpolation:'linear between eight published knots; not a complete spectrum',
        optical_attenuation:'User-assumed constant effective attenuation; no wavelength-dependent scattering model',paper_preset:PAPER}};
    result.geometry=detectorGeometry(cfg);
    result.metadata.scan_config=cfg.scan_config;
    result.metadata.geometry=result.geometry;
    result.metadata.reconstruction_3d='Hilbert-envelope A-lines sampled at one-way depth times';
    const z=volumeAxis(result.depths,cfg),envelope=analyticEnvelope(noisy,np,nt);
    result.zAxis=z;result.volume=new Float32Array(z.length*np);
    for(let k=0;k<z.length;k++){
      const index=(cfg.water_path_mm/cw+z[k]/c-time[0])*fs;
      for(let i=0;i<np;i++)result.volume[k*np+i]=sample(envelope,i*nt,nt,index);
    }
    attachProjections(result);
    return result;
  }
  function detectorGeometry(cfg) {
    const cx=cfg.fov_mm/2,cy=cx,count=cfg.element_count,span=cfg.array_aperture_mm,R=span/2,positions=[];
    for(let i=0;i<(cfg.scan_config==='raster'?1:count);i++){
      const u=count===1?0:i/(count-1)-.5;
      if(cfg.scan_config==='raster')positions.push([cx,cy,-cfg.water_path_mm]);
      else if(cfg.scan_config==='linear')positions.push([cx+u*span,cy,-cfg.water_path_mm]);
      else if(cfg.scan_config==='arc'){const a=u*cfg.arc_angle_deg*Math.PI/180;positions.push([cx+R*Math.sin(a),cy,cfg.depth_mm-R*Math.cos(a)]);}
      else if(cfg.scan_config==='ring'){const a=i/count*2*Math.PI;positions.push([cx+R*Math.cos(a),cy+R*Math.sin(a),cfg.depth_mm]);}
      else if(cfg.scan_config==='matrix'){const cols=Math.ceil(Math.sqrt(count)),rows=Math.ceil(count/cols);positions.push([cx+((i%cols)/(cols-1)-.5)*span,cy+(Math.floor(i/cols)/(rows-1)-.5)*span,-cfg.water_path_mm]);}
      else {const h=(i+.5)/count,a=i*Math.PI*(3-Math.sqrt(5)),r=Math.sqrt(1-h*h);positions.push([cx+R*r*Math.cos(a),cy+R*r*Math.sin(a),cfg.depth_mm-R*h]);}
    }
    return {type:cfg.scan_config,label:SCANS[cfg.scan_config].label,positions_mm:positions,
      raster_position_note:cfg.scan_config==='raster'?'Listed position is the reference center. Per-trace positions follow the exported scan_x_mm and scan_y_mm axes.':null,
      receiver:cfg.scan_config==='raster'?'assumed focused scanning detector':'ideal omnidirectional point receivers with identical temporal response',
      description:SCANS[cfg.scan_config].description,rf_axes:cfg.scan_config==='raster'?['scan_y','scan_x','time']:['detector','time']};
  }
  function fft(re,im,inverse=false){
    const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}}
    for(let len=2;len<=n;len<<=1){const angle=(inverse?2:-2)*Math.PI/len,wr0=Math.cos(angle),wi0=Math.sin(angle);
      for(let i=0;i<n;i+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const a=i+j,b=a+len/2,tr=re[b]*wr-im[b]*wi,ti=re[b]*wi+im[b]*wr;re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;const nr=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=nr;}}}
    if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}
  }
  function analyticEnvelope(rf,count,nt){
    const output=new Float32Array(rf.length),re=new Float64Array(nt),im=new Float64Array(nt);
    for(let ch=0;ch<count;ch++){const offset=ch*nt;for(let t=0;t<nt;t++){re[t]=rf[offset+t];im[t]=0;}fft(re,im);
      for(let t=1;t<nt/2;t++){re[t]*=2;im[t]*=2;}for(let t=nt/2+1;t<nt;t++){re[t]=0;im[t]=0;}fft(re,im,true);
      for(let t=0;t<nt;t++)output[offset+t]=Math.hypot(re[t],im[t]);}
    return output;
  }
  function sample(array,offset,nt,index){const k=Math.floor(index);if(k<0||k>=nt-1)return 0;const f=index-k;return array[offset+k]*(1-f)+array[offset+k+1]*f;}
  function volumeAxis(depths,cfg){let lo=Infinity,hi=0;for(const d of depths){lo=Math.min(lo,d);hi=Math.max(hi,d);}const pad=Math.max(.15,3*cfg.source_thickness_mm);lo=Math.max(.001,lo-pad);hi+=pad;return Float64Array.from({length:64},(_,i)=>lo+(hi-lo)*i/63);}
  function attachProjections(r){
    const n=r.n,nz=r.zAxis.length,xy=new Float32Array(n*n),yz=new Float32Array(n*nz),zx=new Float32Array(n*nz);
    for(let z=0;z<nz;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){const v=r.volume[(z*n+y)*n+x];xy[y*n+x]=Math.max(xy[y*n+x],v);yz[z*n+y]=Math.max(yz[z*n+y],v);zx[z*n+x]=Math.max(zx[z*n+x],v);}
    r.projections={xy,yz,zx};r.laser=laserPulse(r.cfg);r.volumeMetrics=metrics(r.weights,normalize(xy));r.metadata.volume_metrics=r.volumeMetrics;
    r.metadata.volume_axes=['depth_z','y','x'];r.metadata.volume_shape=[nz,n,n];r.metadata.depth_range_mm=[r.zAxis[0],r.zAxis[nz-1]];
    r.metadata.volume_note='Depth evaluation interval is assigned from the phantom. It is not estimated from independent data.';
    r.metadata.laser_intensity_units='MW/cm^2';
  }
  function laserPulse(cfg){const sigma=cfg.pulse_ns/2.35482,time=new Float64Array(257),intensity=new Float32Array(257);for(let i=0;i<257;i++){const ns=(i-128)/128*5*sigma;time[i]=ns/1000;intensity[i]=cfg.fluence_mj_cm2/(Math.sqrt(2*Math.PI)*sigma)*Math.exp(-ns*ns/(2*sigma*sigma));}return {time_us:time,intensity};}
  function simulateArray(reference,cfg,sourceInfo){
    const n=cfg.size,np=n*n,weights=weightsFromReference(reference,cfg.polarity),depths=depthMap(n,cfg),geometry=detectorGeometry(cfg),count=geometry.positions_mm.length;
    const c=cfg.medium==='water'?1.48:1.54,cw=1.48,muA=bloodAbsorption(cfg.wavelength_nm,cfg.oxygenation,cfg.hb_g_l),muEff=cfg.medium==='water'?0:cfg.mu_eff_per_mm;
    const alpha=cfg.medium==='water'?.0022:.75,power=cfg.medium==='water'?2:1.1,fs=Math.ceil(8*cfg.center_mhz/10)*10;
    const sd=1/(2*Math.PI*(cfg.center_mhz*cfg.bandwidth_pct/100/2.35482)),ss=Math.hypot(cfg.pulse_ns/1000/2.35482,cfg.source_thickness_mm/c/2.35482),sigma=Math.hypot(sd,ss);
    const omega=2*Math.PI*cfg.center_mhz*sd*sd/(sigma*sigma),freq=omega/(2*Math.PI),gain=sd/sigma*Math.exp(-.5*(2*Math.PI*cfg.center_mhz)**2*sd*sd*ss*ss/(sigma*sigma));
    const p0=new Float32Array(np),sources=[],area=(cfg.fov_mm/n)**2;
    let maxTime=0;
    for(let i=0;i<np;i++){
      p0[i]=cfg.gruneisen*muA*100*cfg.fluence_mj_cm2*10*Math.exp(-muEff*depths[i])*weights[i];
      if(weights[i]>.015)sources.push({x:(i%n+.5)*cfg.fov_mm/n,y:(Math.floor(i/n)+.5)*cfg.fov_mm/n,z:depths[i],amp:p0[i]/1e5*area});
    }
    // Bound the complete field, including blank cases, so data shape is source-independent.
    const zAxis=volumeAxis(depths,cfg);
    for(const d of geometry.positions_mm)for(const x of [0,cfg.fov_mm])for(const y of [0,cfg.fov_mm])for(const z of [zAxis[0],zAxis[zAxis.length-1]])maxTime=Math.max(maxTime,Math.hypot(x-d[0],y-d[1],z-d[2])/Math.min(c,cw));
    const nt=2**Math.ceil(Math.log2(Math.max(128,Math.ceil((maxTime+8*sigma)*fs))));
    if(nt*count>12000000)throw Error('Array recording is too large. Reduce element count, aperture, or frequency.');
    const time=Float64Array.from({length:nt},(_,i)=>i/fs),clean=new Float32Array(count*nt),noisy=new Float32Array(count*nt),detectorPeak=new Float32Array(count);
    for(let ch=0;ch<count;ch++){
      const d=geometry.positions_mm[ch],offset=ch*nt;
      for(const s of sources){const distance=Math.max(.02,Math.hypot(s.x-d[0],s.y-d[1],s.z-d[2])),waterFraction=d[2]<0?-d[2]/(s.z-d[2]):0;
        const waterLength=distance*waterFraction,tissueLength=distance-waterLength,arrival=waterLength/cw+tissueLength/c;
        const loss=.0022*freq**2*waterLength/10+alpha*freq**power*tissueLength/10;
        const amp=s.amp/distance*10**(-loss/20)*gain;if(amp<1e-15)continue;
        const first=Math.max(0,Math.floor((arrival-6*sigma)*fs)),last=Math.min(nt-1,Math.ceil((arrival+6*sigma)*fs));
        for(let t=first;t<=last;t++){const dt=t/fs-arrival;clean[offset+t]+=amp*Math.exp(-dt*dt/(2*sigma*sigma))*Math.sin(omega*dt);}
      }
    }
    const random=rng(cfg.seed+16607);let cleanPeak=0;
    // One laser pulse excites all elements simultaneously; its jitter is shared by channels.
    const pulseScale=Math.max(0,1+cfg.pulse_jitter_pct/100*normal(random));
    for(let ch=0;ch<count;ch++)for(let t=0;t<nt;t++){const i=ch*nt+t;noisy[i]=clean[i]*pulseScale+cfg.noise_rms*normal(random);detectorPeak[ch]=Math.max(detectorPeak[ch],Math.abs(noisy[i]));cleanPeak=Math.max(cleanPeak,Math.abs(clean[i]));}
    // A matched packet filter, followed by straight-ray, one-way delay-and-sum.
    const radius=Math.ceil(5*sigma*fs),kernel=new Float64Array(radius*2+1);let energy=0;
    for(let k=-radius;k<=radius;k++){const dt=k/fs,v=Math.exp(-dt*dt/(2*sigma*sigma))*Math.sin(omega*dt);kernel[k+radius]=v;energy+=v*v;}
    const filtered=new Float32Array(noisy.length);
    for(let ch=0;ch<count;ch++)for(let t=0;t<nt;t++){let sum=0;for(let k=-radius;k<=radius;k++)if(t+k>=0&&t+k<nt)sum+=noisy[ch*nt+t+k]*kernel[k+radius];filtered[ch*nt+t]=sum/(energy||1);}
    const volume=new Float32Array(np*zAxis.length);
    for(let iz=0;iz<zAxis.length;iz++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const px=(x+.5)*cfg.fov_mm/n,py=(y+.5)*cfg.fov_mm/n,z=zAxis[iz];let sum=0;
      for(let ch=0;ch<count;ch++){const d=geometry.positions_mm[ch],distance=Math.max(.02,Math.hypot(px-d[0],py-d[1],z-d[2])),wf=d[2]<0?-d[2]/(z-d[2]):0;
        const arrival=distance*(wf/cw+(1-wf)/c);sum+=sample(filtered,ch*nt,nt,arrival*fs)*distance;}
      volume[(iz*n+y)*n+x]=Math.max(0,sum/count);
    }
    const warnings=[SCANS[cfg.scan_config].description,'Array mode uses point-source packets and matched-filter delay-and-sum with straight rays. It does not execute k-Wave or model refraction.','RF is in relative receive units. The depth evaluation range is assigned from the synthetic phantom.'];
    const pitch=cfg.scan_config==='matrix'?cfg.array_aperture_mm/(Math.ceil(Math.sqrt(count))-1):cfg.scan_config==='ring'?Math.PI*cfg.array_aperture_mm/count:cfg.array_aperture_mm/(count-1);
    if(pitch>c/cfg.center_mhz/2)warnings.push(`Sparse educational array: approximately ${pitch.toFixed(2)} mm element pitch exceeds half an acoustic wavelength. Sparse-view and spatial sampling artifacts are expected.`);
    if(cfg.scan_config==='ring')warnings.push('A single in-plane ring cannot uniquely recover out-of-plane depth.');
    const result={cfg,n,nt,time,reference:Float32Array.from(reference),weights,depths,p0,clean,noisy,geometry,detectorPeak,volume,zAxis,
      metadata:{schema:'vascular-pa-lab/1.1',version:VERSION,engine:'analytic-array-surrogate',kwave_executed:false,config:cfg,source:sourceInfo,
        array_order:'C',rf_axes:['detector','time'],rf_units:'arbitrary_receive_units',scan_config:cfg.scan_config,geometry,
        map_algorithm:'maximum over depth of matched-filter delay-and-sum reconstruction',reconstruction_3d:'matched-filter delay-and-sum; geometric 1/r compensation; positivity condition',
        receiver_model:'Ideal point sensors; identical Gaussian-modulated packet response',source_model:'MAP-derived sheet, discrete pixel-area-weighted point emitters, absorber weights >0.015 retained',
        depth_assumption:'one assigned absorbing sheet per pixel',sound_speed_m_s:c*1000,mu_a_cm_inv:muA,sample_rate_mhz:fs,time_start_us:0,
        clean_peak_au:cleanPeak,focal_fwhm_mm:null,warnings,paper_preset:PAPER,optical_source:'https://omlc.org/spectra/hemoglobin/summary.html',
        optical_attenuation:'User-assumed constant effective attenuation; no wavelength-dependent scattering model',shape_normalization:'one global maximum for complete reconstructed MAP'}};
    attachProjections(result);result.map=result.projections.xy;result.shape=normalize(result.map);result.displayMap=referenceFromWeights(result.shape,cfg.polarity);
    result.metrics=metrics(weights,result.shape);result.metadata.metrics=result.metrics;return result;
  }
  function scene(result) { return {schema:'vascular-pa-scene/1',config:result.cfg,source:result.metadata.source,
    geometry:result.geometry,
    reference:Array.from(result.reference),weights:Array.from(result.weights),depth_mm:Array.from(result.depths),
    mu_a_cm_inv:result.metadata.mu_a_cm_inv,note:'Input is a MAP; assigned 3D sheet is one possible phantom, not recovered truth.'}; }
  function npy(array,shape,kind='<f4') {
    const bytes=kind==='<f8'?8:kind==='|u1'?1:4;
    const header=`{'descr': '${kind}', 'fortran_order': False, 'shape': (${shape.join(', ')}${shape.length===1?',':''}), }`;
    const padded=header+' '.repeat((64-(10+header.length+1)%64)%64)+'\n';
    const output=new Uint8Array(10+padded.length+array.length*bytes),view=new DataView(output.buffer);
    output.set([147,78,85,77,80,89,1,0]);view.setUint16(8,padded.length,true);output.set(new TextEncoder().encode(padded),10);
    for(let i=0;i<array.length;i++){const p=10+padded.length+i*bytes;if(bytes===8)view.setFloat64(p,array[i],true);else if(bytes===4)view.setFloat32(p,array[i],true);else output[p]=array[i];}
    return output;
  }
  const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  function crc32(a){let c=0xffffffff;for(const x of a)c=crcTable[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
  function zip(files) {
    const encoder=new TextEncoder(),locals=[],central=[];let offset=0;
    for(const [name,data] of Object.entries(files)) {
      const filename=encoder.encode(name),crc=crc32(data),local=new Uint8Array(30+filename.length),v=new DataView(local.buffer);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,filename.length,true);local.set(filename,30);
      const entry=new Uint8Array(46+filename.length),e=new DataView(entry.buffer);e.setUint32(0,0x02014b50,true);e.setUint16(4,20,true);e.setUint16(6,20,true);e.setUint32(16,crc,true);e.setUint32(20,data.length,true);e.setUint32(24,data.length,true);e.setUint16(28,filename.length,true);e.setUint32(42,offset,true);entry.set(filename,46);
      locals.push(local,data);central.push(entry);offset+=local.length+data.length;
    }
    const centralSize=central.reduce((a,b)=>a+b.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length,true);e.setUint16(10,central.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
    const output=new Uint8Array(offset+centralSize+22);let pos=0;for(const a of [...locals,...central,end]){output.set(a,pos);pos+=a.length;}return output;
  }
  function exportNPZ(r) {
    const files={},shape=[r.n,r.n],rfShape=r.cfg.scan_config==='raster'?[r.n,r.n,r.nt]:[r.geometry.positions_mm.length,r.nt];
    for(const [key,value] of Object.entries({input_reference:r.reference,absorber_weight:r.weights,depth_mm:r.depths,initial_pressure_pa:r.p0,map_raw:r.map,map_shape:r.shape,map_display:r.displayMap}))files[key+'.npy']=npy(value,shape);
    files['rf_clean.npy']=npy(r.clean,rfShape);files['rf_noisy.npy']=npy(r.noisy,rfShape);files['time_us.npy']=npy(r.time,[r.nt],'<f8');
    if(r.volume){files['reconstruction_volume.npy']=npy(r.volume,[r.zAxis.length,r.n,r.n]);files['depth_axis_mm.npy']=npy(r.zAxis,[r.zAxis.length],'<f8');}
    files['projection_xy.npy']=npy(r.projections.xy,[r.n,r.n]);files['projection_yz.npy']=npy(r.projections.yz,[r.zAxis.length,r.n]);files['projection_zx.npy']=npy(r.projections.zx,[r.zAxis.length,r.n]);
    files['laser_time_us.npy']=npy(r.laser.time_us,[r.laser.time_us.length],'<f8');files['laser_intensity_mw_cm2.npy']=npy(r.laser.intensity,[r.laser.intensity.length]);
    files['detector_positions_mm.npy']=npy(Float64Array.from(r.geometry.positions_mm.flat()),[r.geometry.positions_mm.length,3],'<f8');
    if(r.detectorPeak)files['detector_peak.npy']=npy(r.detectorPeak,[r.detectorPeak.length]);
    if(r.cfg.scan_config==='raster'){const axis=Float64Array.from({length:r.n},(_,i)=>(i+.5)*r.cfg.fov_mm/r.n);files['scan_x_mm.npy']=npy(axis,[r.n],'<f8');files['scan_y_mm.npy']=npy(axis,[r.n],'<f8');}
    const metadata=new TextEncoder().encode(JSON.stringify(r.metadata));files['metadata_utf8.npy']=npy(metadata,[metadata.length],'|u1');
    return zip(files);
  }
  function grayPNG(values,width,height){
    if(values.length!==width*height)throw Error('PNG dimensions do not match the image.');
    const raw=new Uint8Array((width+1)*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)raw[y*(width+1)+x+1]=Math.round(clamp(values[y*width+x],0,1)*255);
    const blocks=Math.ceil(raw.length/65535),zlib=new Uint8Array(2+blocks*5+raw.length+4);zlib.set([0x78,0x01]);let source=0,p=2;
    while(source<raw.length){const len=Math.min(65535,raw.length-source);zlib[p++]=source+len===raw.length?1:0;zlib[p++]=len&255;zlib[p++]=len>>>8;zlib[p++]=(~len)&255;zlib[p++]=((~len)>>>8)&255;zlib.set(raw.subarray(source,source+len),p);p+=len;source+=len;}
    let a=1,b=0;for(const byte of raw){a=(a+byte)%65521;b=(b+a)%65521;}new DataView(zlib.buffer).setUint32(p,((b<<16)|a)>>>0,false);
    function chunk(type,data){const name=new TextEncoder().encode(type),out=new Uint8Array(12+data.length),v=new DataView(out.buffer);v.setUint32(0,data.length,false);out.set(name,4);out.set(data,8);v.setUint32(8+data.length,crc32(out.subarray(4,8+data.length)),false);return out;}
    const ihdr=new Uint8Array(13),iv=new DataView(ihdr.buffer);iv.setUint32(0,width,false);iv.setUint32(4,height,false);ihdr[8]=8;
    const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib),chunk('IEND',new Uint8Array())],out=new Uint8Array(chunks.reduce((s,c)=>s+c.length,0));let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length;}return out;
  }
  function exportDatasetBundle(r,guides){
    for(const name of ['readme','physics','reconstruction'])if(!guides||typeof guides[name]!=='string'||guides[name].length<200)throw Error('A complete dataset bundle requires the data, physics and reconstruction guides.');
    const text=s=>new TextEncoder().encode(s),view=referenceFromWeights(normalize(r.projections.xy),r.cfg.polarity),files={
      'data/images/input_reference.png':grayPNG(r.reference,r.n,r.n),
      'data/images/absorber_weight.png':grayPNG(r.weights,r.n,r.n),
      'data/images/reconstruction_xy.png':grayPNG(view,r.n,r.n),
      'data/signals/pa_signals.npz':exportNPZ(r),
      'data/metadata.json':text(JSON.stringify(r.metadata,null,2)),
      'data/scene.json':text(JSON.stringify(scene(r))),
      'data/README.md':text(guides.readme),'data/physics.md':text(guides.physics),'data/reconstruction_guide.md':text(guides.reconstruction)
    };
    files['data/receiver_geometry.csv']=text('detector,x_mm,y_mm,z_mm\n'+r.geometry.positions_mm.map((p,i)=>[i,...p].join(',')).join('\n')+'\n');
    return zip(files);
  }
  return {VERSION,DEFAULTS,PAPER,SCANS,HB,rng,normalize,bloodAbsorption,generateVessels,demoWeights,referenceFromWeights,weightsFromReference,depthMap,blur,metrics,simulate,detectorGeometry,analyticEnvelope,laserPulse,scene,exportNPZ,exportDatasetBundle,grayPNG,npy,zip};
});
