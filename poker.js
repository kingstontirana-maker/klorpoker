import { randomInt } from 'node:crypto';
import { ranks, suits } from './public/poker-core.js';
export * from './public/poker-core.js';
export function deck(){const a=[];for(const s of suits)for(const r of ranks)a.push(r+s);for(let i=a.length-1;i>0;i--){let j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
