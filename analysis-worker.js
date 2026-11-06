// Heavy read-only queries run here, on their own thread and connection, so the game
// thread never waits for them: tables keep playing however large the history gets.
import {parentPort,workerData} from 'node:worker_threads';
import {DatabaseSync} from 'node:sqlite';
import {PAIR_SQL,TOTALS_SQL} from './store.js';

const {file,since,day,minHands}=workerData,db=new DatabaseSync(file,{readOnly:true});
const rows=(sql,...args)=>db.prepare(sql).all(...args).map(r=>({...r})),far=Number.MAX_SAFE_INTEGER;
const result={pairs:rows(PAIR_SQL,since,minHands),totals:rows(TOTALS_SQL,since,far),today:rows(TOTALS_SQL,day,far)};
db.close();
parentPort.postMessage(result);
