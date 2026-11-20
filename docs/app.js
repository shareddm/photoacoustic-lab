(function(){
  'use strict';
  const P=window.PALab,V=window.PAViews,$=id=>document.getElementById(id),form=$('parameters'),viewer=new V.VolumeView($('volume'));
  const selection={x:0,y:0,detector:0};let result=null,uploadImage=null,uploadName='',sourceInfo={kind:'procedural'},dirty=true,scopeZoom=false;
  const release=window.PARelease||{downloadsEnabled:false,minDemoSeed:1,maxDemoSeed:50,canonicalImageSize:128};
  const fields=Object.keys(P.DEFAULTS);
  for(let seed=release.minDemoSeed;seed<=release.maxDemoSeed;seed++){const option=document.createElement('option');option.value=seed;option.textContent=String(seed).padStart(2,'0');$('demo-seed').append(option);}
  function applyTheme(theme){
    document.documentElement.dataset.theme=theme;
    const light=theme==='light',label=light?'Dark mode':'Light mode';
    $('theme-label').textContent=label;$('theme-icon').textContent=light?'☾':'☀';
    $('theme-toggle').setAttribute('aria-label','Switch to '+label.toLowerCase());
    $('theme-toggle').title='Current theme: '+theme;
    try{localStorage.setItem('photoacoustics.theme',theme);}catch(e){}
    document.querySelector('.schematic-card img').src=light?'microscope-system-light.svg':'microscope-system.svg';
    if(result){resizeVolume();for(const plane of ['xy','yz','zx'])V.projection($('view-'+plane),result.projections[plane],result.n,result.zAxis.length,plane,result);}
  }
  $('theme-toggle').onclick=()=>applyTheme(document.documentElement.dataset.theme==='light'?'dark':'light');
  applyTheme(document.documentElement.dataset.theme||'dark');
  function config(){const c={...P.DEFAULTS};for(const k of fields){const e=$(k);if(e)c[k]=typeof P.DEFAULTS[k]==='number'?Number(e.value):e.value;}if(!Number.isInteger(c.seed)||c.seed<release.minDemoSeed||c.seed>release.maxDemoSeed)throw Error("Choose a demo seed from 1 to 50.");return c;}
  function setConfig(c){for(const k of fields)if($(k))$(k).value=c[k];$('demo-seed').value=c.seed;updateOutputs();}
  function updateOutputs(){
    document.querySelectorAll('output[for]').forEach(e=>{const input=$(e.htmlFor);e.textContent=input.value+' '+(input.dataset.unit||'');});
    const type=$('scan_config').value,raster=type==='raster';
    $('depth_span_mm').disabled=$('depth_mode').value==='plane';$('mu_eff_per_mm').disabled=$('medium').value==='water';
    for(const id of ['element_count','array_aperture_mm'])$(id).disabled=raster;
    for(const id of ['focus_depth_mm','numerical_aperture'])$(id).disabled=!raster;
    $('arc_angle_deg').disabled=type!=='arc';$('water_path_mm').disabled=!['raster','linear','matrix'].includes(type);
    $('geometry-description').textContent=P.SCANS[type].description;
  }
  function disableExports(value){$('export-dataset').disabled=value||!release.downloadsEnabled;}
  function markDirty(){dirty=true;updateOutputs();$('status').textContent='Settings changed. Press Scan to form a new image.';$('scope-state').textContent='PENDING CHANGES';$('scope-state').classList.add('pending');disableExports(true);}
  function getReference(c){
    if(!uploadImage){sourceInfo={kind:'procedural-demo',phantom_id:'demo-'+c.seed,seed:c.seed,canonical_size:release.canonicalImageSize,description:'One of 50 fixed seeded branching vessel phantoms, resampled from a canonical image'};return P.referenceFromWeights(P.demoWeights(c.size,c.seed),c.polarity);}
    const cv=document.createElement('canvas');cv.width=cv.height=c.size;const ctx=cv.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.size,c.size);ctx.drawImage(uploadImage,0,0,c.size,c.size);const pixels=ctx.getImageData(0,0,c.size,c.size).data;
    sourceInfo={kind:'upload',filename:uploadName,original_width:uploadImage.width,original_height:uploadImage.height,resampled_width:c.size,resampled_height:c.size,aspect_handling:'rescaled to square'};
    return Float32Array.from({length:c.size*c.size},(_,i)=>(.2126*pixels[4*i]+.7152*pixels[4*i+1]+.0722*pixels[4*i+2])/255);
  }
  function resizeVolume(){const cv=$('volume'),box=cv.getBoundingClientRect();if(box.width>0&&box.height>0){cv.width=Math.round(box.width);cv.height=Math.round(box.height);viewer.paint();}}
  function drawScope(){if(!result)return;const s=V.scope($('scope'),result,selection,scopeZoom),r=result;
    $('arrival-time').textContent=s.delay===null?'No clean PA':s.delay.toFixed(3)+' µs';$('time-div').textContent=s.timePerDivision.toPrecision(3)+' µs/div';
    $('sampling').textContent=r.metadata.sample_rate_mhz+' MS/s';$('scope-channels').textContent=r.cfg.scan_config==='raster'?'1 detector · '+r.n*r.n+' scan positions':r.geometry.positions_mm.length+' receiver elements';
    $('scope-zoom').textContent=scopeZoom?'Show full event':'Zoom PA event';
    if(r.cfg.scan_config==='raster')$('position-label').textContent=`X ${((selection.x+.5)*r.cfg.fov_mm/r.n).toFixed(2)} mm · Y ${((selection.y+.5)*r.cfg.fov_mm/r.n).toFixed(2)} mm · assigned depth ${r.depths[selection.y*r.n+selection.x].toFixed(2)} mm`;
    else {const d=r.geometry.positions_mm[selection.detector];$('position-label').textContent=`Receiver ${selection.detector+1} / ${r.geometry.positions_mm.length} · X ${d[0].toFixed(1)}, Y ${d[1].toFixed(1)}, Z ${d[2].toFixed(1)} mm`;}
    viewer.selected={...selection};viewer.paint();
  }
  function render(){const r=result,metrics=r.volumeMetrics;
    $('ssim').textContent=metrics.global_ssim.toFixed(3);$('mse').textContent=metrics.normalized_mse.toFixed(4);$('pitch').textContent=(r.cfg.fov_mm/r.n*1000).toFixed(0)+' µm';
    $('acquisition-label').textContent=P.SCANS[r.cfg.scan_config].label;$('volume-grid').textContent=`${r.n} × ${r.n} × ${r.zAxis.length} voxels`;
    $('volume-description').textContent=r.cfg.scan_config==='raster'?'Reconstructed from A-line envelopes · assigned depth range':'Matched-filter delay-and-sum · assigned depth range';
    $('source-name').textContent=uploadImage?uploadName:`Demo image ${r.cfg.seed} / ${release.maxDemoSeed}`;
    $('gt-label').textContent=`Resampled GT · ${r.cfg.fov_mm} × ${r.cfg.fov_mm} mm`;
    $('reference-caption').textContent=r.cfg.polarity==='bright-weaker'?'Brighter pixels are assigned weaker absorber weights.':'Brighter pixels are assigned stronger absorber weights.';
    V.grayscale($('input-map'),r.reference,r.n);
    for(const plane of ['xy','yz','zx'])V.projection($('view-'+plane),r.projections[plane],r.n,r.zAxis.length,plane,r);
    $('raster-selection').hidden=r.cfg.scan_config!=='raster';$('array-selection').hidden=r.cfg.scan_config==='raster';
    for(const id of ['scan-x','scan-y'])$(id).max=r.n-1;$('scan-x').value=selection.x;$('scan-y').value=selection.y;
    $('detector-index').max=r.geometry.positions_mm.length-1;$('detector-index').value=selection.detector;
    $('assumptions').replaceChildren();const title=document.createElement('strong');title.textContent='About this scan';$('assumptions').append(title);
    for(const warning of r.metadata.warnings){const p=document.createElement('p');p.textContent=warning;$('assumptions').append(p);}
    $('demo-seed').value=r.cfg.seed;
    $('export-description').textContent='Data downloads are disabled until publication. The future ZIP pairs 2D PNG images and exact image arrays with '+(r.cfg.scan_config==='raster'?'raster A-lines':'per-receiver PA signals')+', receiver coordinates, settings, and data, physics and reconstruction guides.';
    resizeVolume();viewer.mode=$('volume-mode').value;viewer.setResult(r);$('depth-stretch').value=String(viewer.stretch);drawScope();
    document.body.dataset.engine=r.metadata.engine;document.body.dataset.scanConfig=r.cfg.scan_config;document.body.dataset.ready='true';
  }
  async function run(event){if(event)event.preventDefault();for(const id of ['run','apply'])$(id).disabled=true;$('status').classList.remove('error');$('status').textContent='Simulating signals and reconstructing the 3D volume…';$('scope-state').textContent='SCANNING';disableExports(true);await new Promise(requestAnimationFrame);await new Promise(resolve=>setTimeout(resolve,20));const start=performance.now();
    try{const c=config();result=P.simulate(getReference(c),c,sourceInfo);dirty=false;scopeZoom=false;let strongest=0,index=0;for(let i=0;i<result.weights.length;i++)if(result.weights[i]>strongest){strongest=result.weights[i];index=i;}selection.x=index%c.size;selection.y=Math.floor(index/c.size);selection.detector=0;
      if(c.scan_config!=='raster'){let peak=0;for(let i=0;i<result.detectorPeak.length;i++)if(result.detectorPeak[i]>peak){peak=result.detectorPeak[i];selection.detector=i;}}
      render();$('status').textContent=`Scan complete · ${((performance.now()-start)/1000).toFixed(2)} s · seed ${c.seed}`;$('scope-state').textContent='ACQUISITION COMPLETE';$('scope-state').classList.remove('pending');disableExports(false);
    }catch(e){$('status').textContent=e.message;$('status').classList.add('error');$('scope-state').textContent='CHECK SETTINGS';$('scope-state').classList.add('pending');document.body.dataset.ready='false';}
    finally{for(const id of ['run','apply'])$(id).disabled=false;}
  }
  function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
  form.addEventListener('submit',run);form.addEventListener('input',markDirty);form.addEventListener('change',updateOutputs);
  $('scan_config').addEventListener('change',()=>{const preset=P.SCANS[$('scan_config').value];$('center_mhz').value=preset.frequency;markDirty();$('status').textContent=`Loaded ${preset.label.toLowerCase()} example at ${preset.frequency} MHz. Press Scan to apply.`;});
  $('generate').onclick=()=>{uploadImage=null;uploadName='';$('upload').value='';$('seed').value=Number($('seed').value)>=release.maxDemoSeed?release.minDemoSeed:Number($('seed').value)+1;$('demo-seed').value=$('seed').value;run();};
  $('demo-seed').onchange=()=>{uploadImage=null;uploadName='';$('upload').value='';$('seed').value=$('demo-seed').value;run();};
  $('reset').onclick=()=>{uploadImage=null;uploadName='';$('upload').value='';setConfig(P.DEFAULTS);run();};
  $('paper-preset').onclick=()=>{$('scan_config').value='raster';$('center_mhz').value=50;$('wavelength_nm').value=532;$('pulse_ns').value=8;markDirty();};
  $('upload').onchange=async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>20*1024*1024)throw Error('Choose an image smaller than 20 MB.');uploadImage=await createImageBitmap(file);uploadName=file.name;$('polarity').value='bright-weaker';await run();}catch(e){$('status').textContent=e.message;$('status').classList.add('error');}};
  for(const [id,axis] of [['scan-x','x'],['scan-y','y'],['detector-index','detector']])$(id).oninput=()=>{selection[axis]=+$(id).value;drawScope();};
  function pickPosition(x,y){if(!result)return;const r=result;selection.x=Math.max(0,Math.min(r.n-1,Math.floor(x*r.n)));selection.y=Math.max(0,Math.min(r.n-1,Math.floor(y*r.n)));
    if(r.cfg.scan_config!=='raster'){let nearest=Infinity;const px=(selection.x+.5)*r.cfg.fov_mm/r.n,py=(selection.y+.5)*r.cfg.fov_mm/r.n,z=r.depths[selection.y*r.n+selection.x];r.geometry.positions_mm.forEach((d,i)=>{const distance=Math.hypot(px-d[0],py-d[1],z-d[2]);if(distance<nearest){nearest=distance;selection.detector=i;}});$('detector-index').value=selection.detector;}
    $('scan-x').value=selection.x;$('scan-y').value=selection.y;drawScope();
  }
  $('input-map').onclick=e=>{const box=e.target.getBoundingClientRect();pickPosition((e.clientX-box.left)/box.width,(e.clientY-box.top)/box.height);};
  $('view-xy').onclick=e=>{const box=e.target.getBoundingClientRect();pickPosition(((e.clientX-box.left)/box.width*420-48)/(420-48-18),((e.clientY-box.top)/box.height*420-12)/(420-12-43));};
  $('volume-mode').onchange=()=>{viewer.mode=$('volume-mode').value;viewer.prepare();$('volume-description').textContent=viewer.mode==='phantom'?'Assigned source sheet · synthetic anatomy, not a reconstruction':result.cfg.scan_config==='raster'?'Reconstructed from A-line envelopes · assigned depth range':'Matched-filter delay-and-sum · assigned depth range';};
  $('depth-stretch').onchange=()=>{viewer.stretch=+$('depth-stretch').value;viewer.paint();};$('display-threshold').oninput=()=>{viewer.threshold=+$('display-threshold').value;viewer.prepare();};
  $('reset-camera').onclick=()=>{viewer.yaw=-.7;viewer.pitch=.8;viewer.zoom=1;viewer.paint();};$('scope-zoom').onclick=()=>{scopeZoom=!scopeZoom;drawScope();};window.addEventListener('resize',resizeVolume);
  $('export-dataset').onclick=async()=>{if(!release.downloadsEnabled||!result||dirty)return;disableExports(true);await new Promise(resolve=>setTimeout(resolve,20));try{download(P.exportDatasetBundle(result,window.PADataGuides),`photoacoustic-lab-v1.1-${result.cfg.scan_config}-${result.cfg.seed}.zip`,'application/zip');}catch(e){$('status').textContent='Export failed: '+e.message;}finally{disableExports(dirty);}};
  setConfig(P.DEFAULTS);run();
})();
