import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AVATARS,avatarExists,avatarSvg} from './public/avatars.js';

test('the picture list is complete and safe to draw',()=>{
 assert.ok(AVATARS.length>=80&&AVATARS.length<=100);assert.equal(new Set(AVATARS.map(a=>a.id)).size,AVATARS.length);
 for(const a of AVATARS){assert.match(a.id,/^[a-z0-9]+$/);assert.ok(a.name&&a.group);assert.ok(!/undefined|NaN|<script|on[a-z]+=|href/.test(a.svg),a.id);assert.equal(avatarSvg(a.id),a.svg);
  if(a.group==='Legends'){assert.equal(a.svg,`<img class="avatarPhoto" src="/avatars/${a.id}.webp" alt="" loading="lazy" decoding="async" draggable="false">`);assert.ok(fs.existsSync(`public/avatars/${a.id}.webp`),'the picture file exists: '+a.id);}
  else{assert.match(a.svg,/^<svg viewBox="0 0 100 100"/);assert.ok(a.svg.endsWith('</svg>'));}}
 assert.equal(AVATARS[0].group,'Legends','portraits come first in the picker');
 assert.equal(avatarExists('nope'),false);assert.equal(avatarSvg('nope'),'');assert.equal(avatarExists('constructor'),false);
});
