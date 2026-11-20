'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const P=require('../docs/physics.js'),release=require('../docs/release-policy.js');
assert.equal(release.downloadsEnabled,false);assert.equal(release.minDemoSeed,1);assert.equal(release.maxDemoSeed,50);
const hashes=new Set();for(let seed=1;seed<=50;seed++){const a=P.demoWeights(32,seed);assert.deepEqual(a,P.demoWeights(32,seed));assert(a.some(v=>v>0));hashes.add(crypto.createHash('sha256').update(Buffer.from(a.buffer)).digest('hex'));}assert.equal(hashes.size,50);
for(const seed of [0,51,1.5,NaN])assert.throws(()=>P.demoWeights(32,seed));
const guides={};for(const [key,file] of [['readme','README.md'],['physics','physics.md'],['reconstruction','reconstruction_guide.md']])guides[key]=fs.readFileSync(path.join(__dirname,'../data',file),'utf8');
const out=path.join(__dirname,'../output/export-check');fs.mkdirSync(out,{recursive:true});
for(const type of Object.keys(P.SCANS)){const cfg={...P.DEFAULTS,size:16,seed:1,scan_config:type,center_mhz:5,element_count:9},r=P.simulate(P.referenceFromWeights(P.demoWeights(16,1),cfg.polarity),cfg,{kind:'procedural-demo',seed:1});assert.throws(()=>P.exportDatasetBundle(r,{}));fs.writeFileSync(path.join(out,type+'.zip'),P.exportDatasetBundle(r,guides));}
console.log('Release checks passed: 50 distinct fixed demo images, seed bounds and complete paired export bundles for all receiver configurations.');
