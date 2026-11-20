const fs=require('node:fs'),path=require('node:path'),P=require('../docs/physics.js');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'examples');fs.mkdirSync(dir,{recursive:true});
const cfg={...P.DEFAULTS,size:16,center_mhz:5,depth_mode:'plane',depth_mm:.6,depth_span_mm:0,
  fov_mm:1.5,water_path_mm:.6,focus_depth_mm:.6,source_thickness_mm:.15,medium:'water',noise_rms:0};
const ref=P.referenceFromWeights(P.generateVessels(cfg.size,cfg.seed),cfg.polarity);
const r=P.simulate(ref,cfg,{kind:'procedural',seed:cfg.seed});
fs.writeFileSync(path.join(dir,'kwave-smoke-scene.json'),JSON.stringify(P.scene(r),null,2));
fs.writeFileSync(path.join(dir,'browser-example.npz'),P.exportNPZ(r));
fs.writeFileSync(path.join(dir,'browser-example-metadata.json'),JSON.stringify(r.metadata,null,2));
const acfg={...cfg,scan_config:'matrix',element_count:16,fov_mm:10,array_aperture_mm:12,source_thickness_mm:.02,depth_mm:1.2};
const array=P.simulate(ref,acfg,{kind:'procedural',seed:cfg.seed});
fs.writeFileSync(path.join(dir,'browser-array-example.npz'),P.exportNPZ(array));
fs.writeFileSync(path.join(dir,'browser-array-metadata.json'),JSON.stringify(array.metadata,null,2));
console.log('Generated deterministic example scene and browser dataset.');
