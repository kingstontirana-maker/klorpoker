// Minimal QR Code generator (ISO/IEC 18004): byte mode, error correction M,
// versions 1–10 (up to 213 bytes), automatic mask choice. Returns an SVG string.
// Written in-house because the page's security policy allows no external scripts.
const ECC_PER_BLOCK=[-1,10,16,26,18,24,16,18,22,22,26],BLOCKS=[-1,1,1,1,2,2,4,4,4,5,5],FORMAT_M=0;

const gfMul=(x,y)=>{let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11d);z^=((y>>>i)&1)*x;}return z;};
function rsDivisor(degree){const r=new Array(degree).fill(0);r[degree-1]=1;let root=1;for(let i=0;i<degree;i++){for(let j=0;j<r.length;j++){r[j]=gfMul(r[j],root);if(j+1<r.length)r[j]^=r[j+1];}root=gfMul(root,2);}return r;}
function rsRemainder(data,div){const r=div.map(()=>0);for(const b of data){const f=b^r.shift();r.push(0);div.forEach((c,i)=>{r[i]^=gfMul(c,f);});}return r;}
const rawModules=v=>{let n=(16*v+128)*v+64;if(v>=2){const a=Math.floor(v/7)+2;n-=(25*a-10)*a-55;if(v>=7)n-=36;}return n;};
const dataCodewords=v=>Math.floor(rawModules(v)/8)-ECC_PER_BLOCK[v]*BLOCKS[v];
function alignPositions(v){if(v===1)return [];const n=Math.floor(v/7)+2,step=Math.ceil((v*4+4)/(n*2-2))*2,r=[6];for(let p=v*4+10;r.length<n;p-=step)r.splice(1,0,p);return r;}
const bit=(x,i)=>((x>>>i)&1)!==0;

export function qrMatrix(text){
 const bytes=[...new TextEncoder().encode(text)];
 let v=1;for(;v<=10;v++){const bits=4+(v<10?8:16)+bytes.length*8;if(bits<=dataCodewords(v)*8)break;}
 if(v>10)throw Error('Text too long for this QR generator');
 // Data bits: mode, length, bytes, terminator, padding.
 const bb=[];const put=(val,len)=>{for(let i=len-1;i>=0;i--)bb.push((val>>>i)&1);};
 put(4,4);put(bytes.length,v<10?8:16);for(const b of bytes)put(b,8);
 const cap=dataCodewords(v)*8;put(0,Math.min(4,cap-bb.length));put(0,(8-bb.length%8)%8);for(let p=0xec;bb.length<cap;p^=0xec^0x11)put(p,8);
 const data=[];for(let i=0;i<bb.length;i+=8)data.push(parseInt(bb.slice(i,i+8).join(''),2));
 // Error correction and interleaving.
 const nb=BLOCKS[v],eccLen=ECC_PER_BLOCK[v],raw=Math.floor(rawModules(v)/8),nShort=nb-raw%nb,shortLen=Math.floor(raw/nb),div=rsDivisor(eccLen),blocks=[];
 for(let i=0,k=0;i<nb;i++){const d=data.slice(k,k+shortLen-eccLen+(i<nShort?0:1));k+=d.length;const e=rsRemainder(d,div);if(i<nShort)d.push(0);blocks.push(d.concat(e));}
 const words=[];for(let i=0;i<blocks[0].length;i++)blocks.forEach((b,j)=>{if(i!==shortLen-eccLen||j>=nShort)words.push(b[i]);});
 // Function patterns.
 const size=v*4+17,mod=Array.from({length:size},()=>new Array(size).fill(false)),fn=Array.from({length:size},()=>new Array(size).fill(false));
 const set=(x,y,d)=>{mod[y][x]=d;fn[y][x]=true;};
 for(let i=0;i<size;i++){set(6,i,i%2===0);set(i,6,i%2===0);}
 const finder=(x,y)=>{for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const d=Math.max(Math.abs(dx),Math.abs(dy)),xx=x+dx,yy=y+dy;if(xx>=0&&xx<size&&yy>=0&&yy<size)set(xx,yy,d!==2&&d!==4);}};
 finder(3,3);finder(size-4,3);finder(3,size-4);
 const al=alignPositions(v);for(let i=0;i<al.length;i++)for(let j=0;j<al.length;j++){if(i===0&&j===0||i===0&&j===al.length-1||i===al.length-1&&j===0)continue;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(al[i]+dx,al[j]+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);}
 const format=mask=>{const d=FORMAT_M<<3|mask;let r=d;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);const b=(d<<10|r)^0x5412;
  for(let i=0;i<=5;i++)set(8,i,bit(b,i));set(8,7,bit(b,6));set(8,8,bit(b,7));set(7,8,bit(b,8));for(let i=9;i<15;i++)set(14-i,8,bit(b,i));
  for(let i=0;i<8;i++)set(size-1-i,8,bit(b,i));for(let i=8;i<15;i++)set(8,size-15+i,bit(b,i));set(8,size-8,true);};
 format(0);
 if(v>=7){let r=v;for(let i=0;i<12;i++)r=(r<<1)^((r>>>11)*0x1f25);const b=v<<12|r;for(let i=0;i<18;i++){const c=bit(b,i),a=size-11+i%3,bb2=Math.floor(i/3);set(a,bb2,c);set(bb2,a,c);}}
 // Data in the zigzag order.
 let i=0;for(let right=size-1;right>=1;right-=2){if(right===6)right=5;for(let vert=0;vert<size;vert++)for(let j=0;j<2;j++){const x=right-j,up=((right+1)&2)===0,y=up?size-1-vert:vert;if(!fn[y][x]&&i<words.length*8){mod[y][x]=bit(words[i>>>3],7-(i&7));i++;}}}
 // Masks: try all eight, keep the one with the lowest penalty.
 const masks=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x)=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,(x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
 const apply=m=>{for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!fn[y][x]&&masks[m](x,y))mod[y][x]=!mod[y][x];};
 const penalty=()=>{let p=0;const line=get=>{let run=1,prev=get(0);const seq=[];for(let k=1;k<=size;k++){const c=k<size?get(k):null;if(c===prev)run++;else{if(run>=5)p+=run-2;seq.push(run);run=1;prev=c;}}
   const s=Array.from({length:size},(_,k)=>get(k)?1:0).join('');for(const pat of ['10111010000','00001011101']){let at=s.indexOf(pat);while(at>=0){p+=40;at=s.indexOf(pat,at+1);}}};
  for(let y=0;y<size;y++)line(k=>mod[y][k]);for(let x=0;x<size;x++)line(k=>mod[k][x]);
  for(let y=0;y<size-1;y++)for(let x=0;x<size-1;x++){const c=mod[y][x];if(c===mod[y][x+1]&&c===mod[y+1][x]&&c===mod[y+1][x+1])p+=3;}
  let dark=0;for(const r of mod)for(const c of r)if(c)dark++;const total=size*size;p+=(Math.ceil(Math.abs(dark*20-total*10)/total)-1)*10;return p;};
 let best=0,bestP=Infinity;for(let m=0;m<8;m++){apply(m);format(m);const pen=penalty();if(pen<bestP){bestP=pen;best=m;}apply(m);}
 apply(best);format(best);
 return {size,version:v,mask:best,modules:mod};
}

export function qrSvg(text,{border=4,dark='#08110d',light='#ffffff'}={}){
 const {size,modules}=qrMatrix(text),n=size+border*2;let d='';
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(modules[y][x])d+=`M${x+border},${y+border}h1v1h-1z`;
 return `<svg class="qrSvg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n}" height="${n}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
