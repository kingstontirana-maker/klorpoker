import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// public/qr.js is a browser module; its internals are checked against the QR standard here.
const src=fs.readFileSync(new URL('./public/qr.js',import.meta.url),'utf8').replace(/export /g,'');
const qr=new Function(src+';return {rsDivisor,rsRemainder,qrMatrix,qrSvg,alignPositions,dataCodewords};')();

test('qr: Reed-Solomon, format and version information match the standard',()=>{
 assert.deepEqual(qr.rsRemainder([32,91,11,120,209,114,220,77,67,64,236,17,236,17,236,17],qr.rsDivisor(10)),[196,35,39,119,235,215,231,226,93,23],'ISO example HELLO WORLD 1-M');
 assert.deepEqual([2,3,7,10].map(v=>qr.alignPositions(v)),[[6,18],[6,22],[6,22,38],[6,28,50]]);
 assert.deepEqual([1,3,10].map(v=>Math.floor((qr.dataCodewords(v)*8-4-(v<10?8:16))/8)),[14,42,213],'byte capacity at level M');
});

test('qr: a Tron address becomes a version 3 code with intact finder patterns',()=>{
 const m=qr.qrMatrix('TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7');assert.equal(m.version,3);assert.equal(m.size,29);
 const finder=(x,y)=>{for(let dy=0;dy<7;dy++)for(let dx=0;dx<7;dx++){const d=Math.max(Math.abs(dx-3),Math.abs(dy-3));assert.equal(m.modules[y+dy][x+dx],d!==2,'finder module '+(x+dx)+','+(y+dy));}};
 finder(0,0);finder(22,0);finder(0,22);
 assert.equal(m.modules[29-8][8],true,'dark module');
 // Format information read back from the code gives level M and the chosen mask.
 let bits=0;for(let i=0;i<=5;i++)bits|=(m.modules[i][8]?1:0)<<i;bits|=(m.modules[7][8]?1:0)<<6;bits|=(m.modules[8][8]?1:0)<<7;bits|=(m.modules[8][7]?1:0)<<8;for(let i=9;i<15;i++)bits|=(m.modules[8][14-i]?1:0)<<i;
 const info=(bits^0x5412)>>>10;assert.equal(info>>>3,0,'level M');assert.equal(info&7,m.mask);
 assert.match(qr.qrSvg('T'),/^<svg class="qrSvg" viewBox="0 0 29 29"/);
 assert.throws(()=>qr.qrMatrix('x'.repeat(300)),/too long/);
});
