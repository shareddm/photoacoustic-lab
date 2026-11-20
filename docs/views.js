/* Dependency-free canvas views. Display thresholds and depth stretch never alter exported data. */
(function(root){
  'use strict';
  const clip=(v,a,b)=>Math.max(a,Math.min(b,v));
  const isLight=()=>document.documentElement.dataset.theme==='light';
  function color(v){v=clip(v,0,1);const stops=isLight()?[[244,248,252],[171,215,219],[42,135,132],[20,100,86],[180,97,30]]:[[9,27,49],[21,101,128],[63,211,191],[231,243,185],[255,173,85]],t=v*4,j=Math.min(3,Math.floor(t)),f=t-j;return stops[j].map((x,i)=>Math.round(x+(stops[j+1][i]-x)*f));}
  function maximum(a){let m=0;for(const v of a)m=Math.max(m,v);return m;}
  class VolumeView{
    constructor(canvas){this.canvas=canvas;this.yaw=-.7;this.pitch=.8;this.zoom=1;this.stretch=8;this.threshold=.22;this.mode='reconstruction';this.points=[];this.result=null;this.selected={x:0,y:0,detector:0};
      let start=null;canvas.onpointerdown=e=>{start=[e.clientX,e.clientY,this.yaw,this.pitch];canvas.setPointerCapture(e.pointerId);};
      canvas.onpointermove=e=>{if(!start)return;this.yaw=start[2]+(e.clientX-start[0])*.008;this.pitch=clip(start[3]+(e.clientY-start[1])*.006,.12,1.5);this.paint();};
      canvas.onpointerup=()=>{start=null;};canvas.onpointercancel=()=>{start=null;};
      canvas.addEventListener('wheel',e=>{e.preventDefault();this.zoom=clip(this.zoom*Math.exp(-e.deltaY*.001),.55,2.3);this.paint();},{passive:false});
    }
    setResult(r){this.result=r;this.stretch=r.cfg.scan_config==='raster'?8:1;this.zoom=1;this.prepare();}
    prepare(){if(!this.result)return;const r=this.result,n=r.n,points=[],span=r.cfg.fov_mm,limit=this.threshold;
      if(this.mode==='phantom')for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,v=r.weights[i];if(v>=limit)points.push([(x+.5)*span/n,(y+.5)*span/n,r.depths[i],v]);}
      else {const max=maximum(r.volume)||1;for(let z=0;z<r.zAxis.length;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){const v=r.volume[(z*n+y)*n+x]/max;if(v>=limit)points.push([(x+.5)*span/n,(y+.5)*span/n,r.zAxis[z],v]);}}
      const stride=Math.max(1,Math.ceil(points.length/24000));this.points=points.filter((_,i)=>i%stride===0);this.paint();
    }
    paint(){const r=this.result;if(!r)return;const cv=this.canvas,ctx=cv.getContext('2d'),w=cv.width,h=cv.height,F=r.cfg.fov_mm,zc=(r.zAxis[0]+r.zAxis[r.zAxis.length-1])/2;
      const light=isLight();ctx.clearRect(0,0,w,h);const bg=ctx.createRadialGradient(w*.5,h*.42,40,w*.5,h*.5,w*.7);bg.addColorStop(0,light?'#e8f2f6':'#102939');bg.addColorStop(1,light?'#f8fbfd':'#070f19');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
      let detectors=r.geometry.positions_mm;
      if(r.cfg.scan_config==='raster')detectors=[[(this.selected.x+.5)*F/r.n,(this.selected.y+.5)*F/r.n,-r.cfg.water_path_mm]];
      const ca=Math.cos(this.yaw),sa=Math.sin(this.yaw),cp=Math.cos(this.pitch),sp=Math.sin(this.pitch);
      const transform=(x,y,z)=>{x-=F/2;y-=F/2;z=(z-zc)*this.stretch;const a=x*ca-y*sa,b=x*sa+y*ca;return [a,b*sp+z*cp,b*cp-z*sp];};
      const corners=[];for(const x of [0,F])for(const y of [0,F])for(const z of [0,r.zAxis[r.zAxis.length-1]])corners.push(transform(x,y,z));for(const d of detectors)corners.push(transform(...d));
      const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),scale=Math.min((w-150)/(maxX-minX||1),(h-145)/(maxY-minY||1))*this.zoom;
      const ox=w/2-(minX+maxX)/2*scale,oy=h/2-(minY+maxY)/2*scale;
      const screen=(x,y,z)=>{const p=transform(x,y,z);return [ox+p[0]*scale,oy+p[1]*scale,p[2]];};
      const line=(a,b,c=light?'#a6bfce':'#375061',width=1)=>{const p=screen(...a),q=screen(...b);ctx.strokeStyle=c;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.stroke();};
      ctx.setLineDash([3,7]);for(let k=0;k<=5;k++){const p=k*F/5;line([p,0,0],[p,F,0],light?'#bfd0dc':'#244454');line([0,p,0],[F,p,0],light?'#bfd0dc':'#244454');}ctx.setLineDash([]);
      const zmin=r.zAxis[0],zmax=r.zAxis[r.zAxis.length-1];
      for(const z of [zmin,zmax]){line([0,0,z],[F,0,z]);line([F,0,z],[F,F,z]);line([F,F,z],[0,F,z]);line([0,F,z],[0,0,z]);}
      for(const x of [0,F])for(const y of [0,F])line([x,y,zmin],[x,y,zmax],light?'#b5c8d5':'#2a3e50');
      const cloud=this.points.map(p=>{const q=screen(p[0],p[1],p[2]);return [q[0],q[1],q[2],p[3]];}).sort((a,b)=>a[2]-b[2]);
      const pointRadius=clip(F/r.n*scale*.45,1.2,5);
      for(const p of cloud){const col=color(.2+.8*p[3]);ctx.fillStyle=`rgba(${col.join(',')},${light?.45+.5*p[3]:.2+.7*p[3]})`;ctx.beginPath();ctx.arc(p[0],p[1],pointRadius,0,Math.PI*2);ctx.fill();}
      if(detectors.length>1 && ['linear','arc','ring'].includes(r.cfg.scan_config)){ctx.setLineDash([5,5]);for(let i=1;i<detectors.length;i++)line(detectors[i-1],detectors[i],'#c9986a88');if(r.cfg.scan_config==='ring')line(detectors[detectors.length-1],detectors[0],'#c9986a88');ctx.setLineDash([]);}
      detectors.forEach((d,i)=>{const p=screen(...d),active=r.cfg.scan_config==='raster'||i===this.selected.detector;ctx.fillStyle=active?(light?'#a76421':'#ffd59a'):'#bc8357';ctx.fillRect(p[0]-(active?5:3),p[1]-(active?5:3),active?10:6,active?10:6);});
      if(r.cfg.scan_config==='raster'){const d=detectors[0],z=r.depths[this.selected.y*r.n+this.selected.x];ctx.setLineDash([6,7]);line(d,[d[0],d[1],z],'#e4ae6680');ctx.setLineDash([]);}
      ctx.font='17px -apple-system, sans-serif';ctx.fillStyle=light?'#49677b':'#96afbf';ctx.textAlign='left';
      for(const [text,p] of [[`X · ${F} mm`,[F,F,zmax]],[`Y · ${F} mm`,[0,F,zmax]],[`Z · ${zmin.toFixed(2)}–${zmax.toFixed(2)} mm`,[0,0,zmax]]]){const s=screen(...p);ctx.fillText(text,clip(s[0]-30,16,w-200),clip(s[1]+26,25,h-18));}
      // Compact orientation key remains readable through rotation.
      const bx=68,by=h-72;for(const [label,v,c] of [['X',[1,0,0],'#ecb66b'],['Y',[0,1,0],'#71d9c4'],['Z',[0,0,.8],'#8faee8']]){const q=transform(F/2+v[0],F/2+v[1],zc+v[2]/this.stretch);ctx.strokeStyle=c;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(bx,by);ctx.lineTo(bx+q[0]*34,by+q[1]*34);ctx.stroke();ctx.fillStyle=c;ctx.fillText(label,bx+q[0]*45-5,by+q[1]*45+5);}
    }
  }
  function projection(canvas,data,n,nz,plane,r){const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,pad={l:48,r:18,t:12,b:43},iw=w-pad.l-pad.r,ih=h-pad.t-pad.b,rows=plane==='xy'?n:nz,max=maximum(r.volume)||1;
    const light=isLight();ctx.fillStyle=light?'#f4f8fb':'#07121e';ctx.fillRect(0,0,w,h);const off=document.createElement('canvas');off.width=n;off.height=rows;const x=off.getContext('2d'),im=x.createImageData(n,rows);
    for(let i=0;i<data.length;i++){const col=color(data[i]/max);im.data.set([...col,255],i*4);}x.putImageData(im,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(off,pad.l,pad.t,iw,ih);
    ctx.strokeStyle=light?'#b9cad7':'#315164';ctx.strokeRect(pad.l,pad.t,iw,ih);ctx.font='18px -apple-system, sans-serif';ctx.fillStyle=light?'#456078':'#a1b7c6';ctx.textAlign='center';ctx.fillText(plane==='yz'?'Y (mm)':'X (mm)',pad.l+iw/2,h-8);
    ctx.fillText('0',pad.l,pad.t+ih+22);ctx.fillText(String(r.cfg.fov_mm),pad.l+iw,pad.t+ih+22);ctx.save();ctx.translate(16,pad.t+ih/2);ctx.rotate(-Math.PI/2);ctx.fillText(plane==='xy'?'Y (mm)':'Depth Z (mm)',0,0);ctx.restore();ctx.textAlign='right';ctx.fillText(plane==='xy'?'0':r.zAxis[0].toFixed(2),pad.l-6,pad.t+17);ctx.fillText(plane==='xy'?String(r.cfg.fov_mm):r.zAxis[nz-1].toFixed(2),pad.l-6,pad.t+ih);}
  function grayscale(canvas,values,n){const ctx=canvas.getContext('2d'),off=document.createElement('canvas');off.width=off.height=n;const c=off.getContext('2d'),im=c.createImageData(n,n);for(let i=0;i<values.length;i++){const v=Math.round(clip(values[i],0,1)*255);im.data.set([v,v,v,255],i*4);}c.putImageData(im,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(off,0,0,canvas.width,canvas.height);}
  function scope(canvas,r,selection,zoom=false){const ch=r.cfg.scan_config==='raster'?selection.y*r.n+selection.x:selection.detector,offset=ch*r.nt,ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,left=88,right=w-28,top=28,bottom=h-48,mid=(top+bottom)/2;
    let peak=0,peakIndex=0;for(let t=0;t<r.nt;t++)if(Math.abs(r.clean[offset+t])>peak){peak=Math.abs(r.clean[offset+t]);peakIndex=t;}
    const delay=peak>0?r.time[peakIndex]:null;let last=peakIndex;for(let t=peakIndex;t<r.nt;t++)if(Math.abs(r.clean[offset+t])>peak*.005)last=t;
    const start=zoom&&delay!==null?Math.max(0,delay-.3):-Math.max(.04,r.cfg.pulse_ns/1000*2),end=zoom&&delay!==null?delay+.3:Math.max(1,r.time[last]*1.12+.08);
    ctx.fillStyle='#040d12';ctx.fillRect(0,0,w,h);ctx.lineWidth=1;ctx.strokeStyle='#17343b';
    for(let i=0;i<=50;i++){const x=left+(right-left)*i/50;ctx.strokeStyle=i%5===0?'#24474d':'#10292f';ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();}
    for(let i=0;i<=12;i++){const y=top+(bottom-top)*i/12;ctx.strokeStyle=i%3===0?'#24474d':'#10292f';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.stroke();}
    const xp=t=>left+(t-start)/(end-start)*(right-left),rowH=(bottom-top)/2,laserBase=mid-15,paBase=mid+rowH*.55,laserPeak=maximum(r.laser.intensity)||1;
    ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();ctx.strokeStyle='#edc66c';ctx.shadowColor='#edc66c';ctx.shadowBlur=5;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(left,laserBase);
    for(let i=0;i<r.laser.time_us.length;i++)ctx.lineTo(xp(r.laser.time_us[i]),laserBase-r.laser.intensity[i]/laserPeak*rowH*.7);ctx.lineTo(right,laserBase);ctx.stroke();ctx.shadowBlur=0;
    let paPeak=peak;for(let t=0;t<r.nt;t++)if(r.time[t]>=start&&r.time[t]<=end)paPeak=Math.max(paPeak,Math.abs(r.noisy[offset+t]));paPeak=Math.max(paPeak,1e-10);
    const drawRF=(data,col,width)=>{ctx.beginPath();ctx.strokeStyle=col;ctx.lineWidth=width;let begun=false;for(let i=0;i<r.nt;i++){const t=r.time[i];if(t<start||t>end)continue;const x=xp(t),y=paBase-data[offset+i]/paPeak*rowH*.36;if(begun)ctx.lineTo(x,y);else{ctx.moveTo(x,y);begun=true;}}ctx.stroke();};
    drawRF(r.noisy,'#698b89',1);ctx.shadowColor='#73e4c3';ctx.shadowBlur=4;drawRF(r.clean,'#73e4c3',2);ctx.shadowBlur=0;
    if(delay!==null){ctx.setLineDash([5,7]);ctx.strokeStyle='#e0ad6a99';ctx.beginPath();ctx.moveTo(xp(delay),top);ctx.lineTo(xp(delay),bottom);ctx.stroke();ctx.setLineDash([]);}ctx.restore();
    ctx.font='18px ui-monospace, monospace';ctx.textAlign='right';ctx.fillStyle='#edc66c';ctx.fillText('CH 1',left-12,top+24);ctx.fillText('LASER',left-12,top+47);ctx.fillStyle='#73e4c3';ctx.fillText('CH 2',left-12,mid+30);ctx.fillText('PA',left-12,mid+53);
    ctx.textAlign='left';ctx.font='16px ui-monospace, monospace';ctx.fillStyle='#edc66c';ctx.fillText(`${(maximum(r.laser.intensity)).toPrecision(3)} MW/cm² · ${r.cfg.pulse_ns} ns FWHM`,left+12,top+22);if(start>0)ctx.fillText('Laser pulse at 0 µs · outside this zoom',left+12,top+46);ctx.fillStyle='#73e4c3';ctx.fillText(`${paPeak.toExponential(2)} a.u. peak`,left+12,mid+22);
    ctx.fillStyle='#8ba6a8';ctx.textAlign='center';for(let i=0;i<=10;i++)ctx.fillText((start+(end-start)*i/10).toFixed(end-start<2?2:1),left+(right-left)*i/10,bottom+26);ctx.fillText('Time from laser pulse (µs)',(left+right)/2,h-3);
    return {delay,peak,channel:ch,timePerDivision:(end-start)/10};
  }
  root.PAViews={VolumeView,projection,grayscale,scope,color};
})(window);
