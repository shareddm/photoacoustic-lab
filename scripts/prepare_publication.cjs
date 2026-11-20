/* Build a source-only publication directory; never include unreleased data. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/publication');
const guides={};for(const [key,file] of [['readme','README.md'],['physics','physics.md'],['reconstruction','reconstruction_guide.md']])guides[key]=fs.readFileSync(path.join(root,'data',file),'utf8');
fs.writeFileSync(path.join(root,'docs/data-guides.js'),'// Generated from data/*.md by scripts/prepare_publication.cjs.\nwindow.PADataGuides='+JSON.stringify(guides)+';\n');
const allowed=['README.md','.gitignore','package.json','docs','data','matlab','scripts','tests'];
fs.mkdirSync(out,{recursive:true});
const files=[];
function copy(rel){const src=path.join(root,rel);if(fs.statSync(src).isDirectory()){for(const name of fs.readdirSync(src))copy(path.join(rel,name));return;}
 if(!/\.(?:md|js|cjs|py|css|html|svg|m|json)$/.test(rel)&&!['.gitignore','docs/.nojekyll'].includes(rel))throw Error('Unexpected publication file: '+rel);
 if(/\.(?:npz|npy|mat|png|zip)$/i.test(rel))throw Error('Unreleased dataset must not be published: '+rel);
 const text=fs.readFileSync(src,'utf8');if(/\/Users\/[^\/\s]+\/|\/Downloads\/|BEGIN [A-Z ]+PRIVATE KEY|ghp_[a-zA-Z0-9]{20,}/.test(text))throw Error('Local information in '+rel);
 const dst=path.join(out,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,text);files.push(rel);}
for(const rel of allowed)copy(rel);
fs.writeFileSync(path.join(root,'output/publication-manifest.json'),JSON.stringify(files.sort(),null,2)+'\n');
console.log(`Prepared ${files.length} source and guide files. No dataset files included.`);
