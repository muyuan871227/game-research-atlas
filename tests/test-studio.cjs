'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const S=require('../docs/studio-core.js');
const D=require('../docs/data.json').runtime_delivery;
test('production inputs enforce supported engine-template bounds',()=>{
 const p=S.normalize({moves:-999,goal:999,theme:'<script>',title:'a'.repeat(50),sourceSteps:['merge','merge','fake']});
 assert.equal(p.moves,15);assert.equal(p.goal,256);assert.equal(p.theme,'orbit');assert.equal(p.title.length,24);assert.deepEqual(p.sourceSteps,['merge']);
 assert.equal(S.normalize({moves:Infinity}).moves,40);assert.equal(S.normalize({moves:81}).moves,80);
});
test('export preserves precise evidence identity and never transfers competitor acceptance',()=>{
 const p=S.brief(S.defaults,D);assert.equal(p.research.evidence.length,5);
 const e=p.research.evidence.find(x=>x.step==='merge'),original=D.steps.find(x=>x.id==='merge');
 assert.equal(e.screenshot_sha256,original.sha256);assert.equal(e.video_seconds,original.video_seconds);
 assert.equal(p.engine.name,'cocos');assert.equal(p.engine.stage,'prototype');
 assert.ok(p.acceptance.every(x=>x.status==='not_run'));assert.equal(p.generation.model_called,false);assert.equal(p.generation.cloud_job_submitted,false);assert.equal(p.cost.model_cost,null);
});
test('empty evidence selection remains empty and revisions cannot inject verification',()=>{
 const p=S.brief({...S.defaults,sourceSteps:[]},D);assert.equal(p.research.evidence.length,0);
 const raw=JSON.stringify({schema:'atlas.studio.v1',draft:{...S.defaults,model_called:true},revisions:Array.from({length:20},(_,i)=>({id:String(i),config:S.defaults}))});
 const state=S.readSaved(raw);assert.equal(state.revisions.length,12);assert.equal(state.draft.model_called,undefined);assert.equal(S.readSaved('{'),null);
});
test('task text includes controls, parameter values and unmeasured cost limits',()=>{
 const p=S.brief({...S.defaults,moves:25,goal:512,theme:'garden'},D),task=S.prompt(p);
 assert.match(task,/Cocos Creator 3.8/);assert.match(task,/stage=prototype/);assert.match(task,/"moves":25/);assert.match(task,/"goal":512/);assert.match(task,/G01-LIVE-MERGE/);assert.match(S.markdown(p),/不是可运行构建/);
});
