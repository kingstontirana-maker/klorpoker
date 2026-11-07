import test from 'node:test';
import assert from 'node:assert/strict';
import {AVATARS,avatarExists,avatarSvg} from './public/avatars.js';

test('the picture list is complete and safe to draw',()=>{
 assert.ok(AVATARS.length>=40&&AVATARS.length<=50);assert.equal(new Set(AVATARS.map(a=>a.id)).size,AVATARS.length);
 for(const a of AVATARS){assert.match(a.id,/^[a-z0-9]+$/);assert.ok(a.name&&a.group);assert.match(a.svg,/^<svg viewBox="0 0 100 100"/);assert.ok(a.svg.endsWith('</svg>'));assert.ok(!/undefined|NaN|<script|on[a-z]+=|href/.test(a.svg),a.id);assert.equal(avatarSvg(a.id),a.svg);}
 assert.equal(avatarExists('nope'),false);assert.equal(avatarSvg('nope'),'');assert.equal(avatarExists('constructor'),false);
});
