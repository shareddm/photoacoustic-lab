/* Generate independent, seeded phantoms or simulate a scene received on stdin. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),P=require('../docs/physics.js');
function main(){
  const args=process.argv.slice(2),opts={};
  for(let i=0;i<args.length;i+=2){if(!args[i].startsWith('--')||args[i+1]===undefined)throw Error('Use --count N --seed N --size N --out DIRECTORY [--settings metadata.json] or --scene-stdin true.');opts[args[i].slice(2)]=args[i+1];}
  const dir=path.resolve(opts.out||'output/dataset');fs.mkdirSync(dir,{recursive:true});
  let settings={};if(opts.settings){settings=JSON.parse(fs.readFileSync(opts.settings,'utf8'));settings=settings.config||settings;}
  if(opts['scene-stdin']==='true'){
    const s=JSON.parse(fs.readFileSync(0,'utf8')),cfg={...P.DEFAULTS,...s.config};
    const r=P.simulate(s.reference,cfg,s.source||{kind:'external-image'}),name=(opts.name||'image').replace(/[^A-Za-z0-9_-]/g,'_');
    fs.writeFileSync(path.join(dir,name+'.npz'),P.exportNPZ(r));
    console.log(JSON.stringify({file:name+'.npz',seed:cfg.seed,engine:r.metadata.engine,source:s.source}));return;
  }
  const count=Number(opts.count||10),seed=Number(opts.seed||42),size=Number(opts.size||settings.size||64);
  if(!Number.isInteger(count)||count<1||count>10000)throw Error('count must be an integer from 1 to 10000.');
  const manifest={schema:'vascular-pa-dataset/1.1',engine:settings.scan_config&&settings.scan_config!=='raster'?'analytic-array-surrogate':'analytic-raster-surrogate',kwave_executed:false,
    split_rule:'Each independent phantom gets one split. Keep all variants of that phantom in the same split.',samples:[]};
  for(let i=0;i<count;i++){
    const cfg={...P.DEFAULTS,...settings,size,seed:seed+i},weights=P.generateVessels(size,cfg.seed);
    const r=P.simulate(P.referenceFromWeights(weights,cfg.polarity),cfg,{kind:'procedural',phantom_id:'seed-'+cfg.seed,seed:cfg.seed});
    const filename=`phantom-${cfg.seed}.npz`,bytes=P.exportNPZ(r);
    fs.writeFileSync(path.join(dir,filename),bytes);
    const splitValue=P.rng(cfg.seed+49817)();
    manifest.samples.push({file:filename,phantom_id:'seed-'+cfg.seed,seed:cfg.seed,split:splitValue<.8?'train':splitValue<.9?'validation':'test',sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
    console.log(`${i+1}/${count}: ${filename}`);
  }
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));
}
try{main();}catch(e){console.error(e.message);process.exitCode=1;}
