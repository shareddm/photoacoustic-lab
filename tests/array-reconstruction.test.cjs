'use strict';
const assert=require('node:assert/strict'),P=require('../docs/physics.js');
const cfg={...P.DEFAULTS,size:16,scan_config:'matrix',element_count:16,center_mhz:5,fov_mm:10,array_aperture_mm:12,depth_mode:'plane',depth_mm:1.2,noise_rms:0,water_path_mm:3};
const weights=new Float32Array(16*16);weights[9*16+5]=1;const ref=P.referenceFromWeights(weights,cfg.polarity);
const r=P.simulate(ref,cfg),again=P.simulate(ref,cfg);
assert.equal(P.VERSION,'1.1.0');assert.deepEqual(r.clean,again.clean);assert.deepEqual(r.volume,again.volume);
assert.deepEqual(r.metadata.rf_axes,['detector','time']);assert.deepEqual(r.metadata.volume_shape,[64,16,16]);assert.equal(r.metadata.kwave_executed,false);
assert.ok(r.noisy.every(Number.isFinite)&&r.volume.every(Number.isFinite));assert.ok(r.volume.some(x=>x>0));
const sx=(5+.5)*10/16,sy=(9+.5)*10/16,z=1.2;
for(let channel=0;channel<16;channel++){
  const d=r.geometry.positions_mm[channel],distance=Math.hypot(sx-d[0],sy-d[1],z-d[2]),waterFraction=3/(z+3);
  const expected=distance*(waterFraction/1.48+(1-waterFraction)/1.54);let total=0,centroid=0;
  for(let i=0;i<r.nt;i++){const energy=r.clean[channel*r.nt+i]**2;total+=energy;centroid+=energy*r.time[i];}
  assert.ok(Math.abs(centroid/total-expected)<.03,'per-receiver energy centroid must follow one-way segmented propagation');
}
let max=-1,peak=0;for(let i=0;i<r.volume.length;i++)if(r.volume[i]>max){max=r.volume[i];peak=i;}
assert.equal(peak%16,5,'array reconstruction localizes source x');assert.equal(Math.floor(peak/16)%16,9,'array reconstruction localizes source y');assert.ok(Math.abs(r.zAxis[Math.floor(peak/256)]-1.2)<.08,'array reconstruction localizes source depth');
const double=P.simulate(ref,{...cfg,fluence_mj_cm2:20});for(let i=0;i<r.clean.length;i++)assert.ok(Math.abs(double.clean[i]-2*r.clean[i])<1e-5);
const blank=P.simulate(new Float32Array(256).fill(1),cfg);assert.ok(blank.clean.every(x=>x===0)&&blank.volume.every(x=>x===0));
for(let y=0;y<16;y++)for(let x=0;x<16;x++){let peak=0;for(let k=0;k<64;k++)peak=Math.max(peak,r.volume[(k*16+y)*16+x]);assert.equal(r.projections.xy[y*16+x],peak);}
for(const type of ['linear','arc','ring','matrix','hemisphere']){
  const g=P.detectorGeometry({...cfg,scan_config:type});assert.equal(g.positions_mm.length,16);assert.ok(g.positions_mm.flat().every(Number.isFinite));
  const sample=P.simulate(ref,{...cfg,scan_config:type});assert.equal(sample.noisy.length,16*sample.nt);assert.ok(sample.clean.some(x=>x!==0));
}
const linear=P.detectorGeometry({...cfg,scan_config:'linear'});assert.ok(linear.positions_mm.every(p=>p[1]===5&&p[2]===-3));
const ring=P.detectorGeometry({...cfg,scan_config:'ring'});for(const d of ring.positions_mm)assert.ok(Math.abs(Math.hypot(d[0]-5,d[1]-5)-6)<1e-8);
const laser=P.laserPulse(cfg);assert.equal(laser.time_us[128],0);let energy=0;for(let i=1;i<laser.intensity.length;i++)energy+=(laser.intensity[i]+laser.intensity[i-1])/2*(laser.time_us[i]-laser.time_us[i-1])*1000;assert.ok(Math.abs(energy-cfg.fluence_mj_cm2)<.0001,'laser pulse integrates to the requested fluence');
assert.throws(()=>P.simulate(ref,{...cfg,scan_config:'fake-array'}),/supported scan/);
console.log('PASS: all five array geometries, per-channel propagation timing, 3D source localization, fluence scaling, zero source, volume projections, laser energy, and reproducible reconstruction.');
