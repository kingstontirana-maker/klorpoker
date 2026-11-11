// Bot decisions run here, on their own thread, so a careful calculation never slows the
// tables down. It receives only the bot's view of the table (see botView in bots.js).
import {parentPort} from 'node:worker_threads';
import {decide} from './bot-brain.js';

parentPort.on('message',({id,view,style})=>{
 let decision;try{decision=decide(view,style);}catch(err){decision={type:view.toCall?'fold':'check',error:err.message};}
 parentPort.postMessage({id,decision});
});
