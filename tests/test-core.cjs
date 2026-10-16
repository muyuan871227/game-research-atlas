'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../docs'),C=require(path.join(root,'core.js')),data=JSON.parse(fs.readFileSync(path.join(root,'data.json'),'utf8'));
test('sample search combines name, genre and channel without inventing records',()=>{
 assert.equal(C.filterSamples(data.samples,'西瓜').length,1);
 assert.equal(C.filterSamples(data.samples,'G01')[0].name,'合成大西瓜');
 assert.ok(C.filterSamples(data.samples,'微信').every(s=>s.channel_candidates.some(c=>c.includes('微信'))));
 assert.equal(C.filterSamples(data.samples,'西瓜','生存塔防').length,0);
 assert.equal(C.filterSamples(data.samples,'  nonexistent  ').length,0);
});
test('comparison enforces 3 distinct choices and supports removal',()=>{
 let ids=[];for(const id of ['G01','G02','G03'])ids=C.toggleCompare(ids,id).ids;
 const rejected=C.toggleCompare(ids,'G04');assert.equal(rejected.ids.length,3);assert.ok(rejected.error);
 assert.deepEqual(C.toggleCompare(ids,'G02').ids,['G01','G03']);assert.deepEqual(ids,['G01','G02','G03']);
});
test('96-field unknown sample remains unknown, including falsey fact values',()=>{
 const groups=C.matchedFields(data,'G02','unknown');assert.equal(groups.flatMap(x=>x.fields).length,96);
 const missing=C.observation(data,'G02','core_loop.randomness');assert.equal(missing.value,null);assert.equal(missing.status,'unknown');
 const clone={...data,observations:[{sample_id:'G02',field_id:'core_loop.randomness',value:false,status:'observed'}]};
 assert.equal(C.observation(clone,'G02','core_loop.randomness').value,false);
 assert.equal(C.matchedFields(clone,'G02','observed').flatMap(x=>x.fields).length,1);
});
test('fact counts derive from source records rather than UI constants',()=>{
 assert.equal(C.stats(data,'G01').static,data.observations.filter(o=>o.sample_id==='G01'&&o.status==='static_verified').length);
 assert.equal(C.stats(data,'G02').static,0);assert.equal(C.stats(data).fields,96);
 assert.equal(C.matchedFields(data,'G01','static_verified').flatMap(x=>x.fields).length,C.stats(data).static);
 assert.equal(C.matchedFields(data,'G01','all','impossible_query_xyz').length,0);
});
test('rendered content escapes HTML, attributes and script-like inputs',()=>{
 assert.equal(C.escapeHTML('<img src=x onerror="boom">&'), '&lt;img src=x onerror=&quot;boom&quot;&gt;&amp;');
});
test('source snapshot has 10 unique games, 40 pending tasks and no absolute private path',()=>{
 assert.equal(new Set(data.samples.map(s=>s.sample_id)).size,10);assert.equal(data.tasks.length,40);
 assert.equal(new Set(data.tasks.map(t=>t.task_id)).size,40);
 assert.ok(data.tasks.every(t=>t.status==='not_collected'&&!t.schedule_enabled&&t.evidence_ids.length===0));
 const serialized=JSON.stringify(data);assert.ok(!/\/(Users|home|private)\//.test(serialized));
 assert.ok(!serialized.includes('source_code'));assert.ok(!serialized.includes('function ('));
 const keys=new Set(data.dimensions.flatMap(d=>d.fields.map(f=>f.id)));assert.equal(keys.size,96);
 for(const o of data.observations){assert.ok(keys.has(o.field_id));for(const id of o.evidence_ids)assert.ok(data.evidence.some(e=>e.evidence_id===id&&e.sample_id===o.sample_id));}
});
test('all 6 screens render against actual JSON; filter empty states and compare limit remain usable',async()=>{
 const nodes=new Map(),events={};
 function node(selector){if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',style:{},dataset:{},classList:{toggle(){}},setAttribute(){},removeAttribute(){},addEventListener(){},focus(){},scrollIntoView(){}});return nodes.get(selector);}
 const ctx={ResearchCore:C,console,setTimeout:()=>0,clearTimeout(){},Blob,URL,sessionStorage:{getItem(){return '[]';},setItem(){}},location:{hash:'#library'},document:{querySelector:node,querySelectorAll(){return [];},addEventListener(name,fn){events[name]=fn;},getElementById:id=>node('#'+id)},window:{scrollTo(){},addEventListener(name,fn){events[name]=fn;}},fetch:async()=>({ok:true,json:async()=>data})};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),ctx);await new Promise(resolve=>setImmediate(resolve));
 for(const [route,heading] of [['#library','从游戏机制'],['#detail/G01','合成大西瓜'],['#detail/G02','羊了个羊'],['#compare','把共性与未知'],['#evidence','结论必须有出处'],['#operations','持续积累'],['#cost','把未知成本']]){ctx.location.hash=route;events.hashchange();assert.ok(node('#main').innerHTML.includes(heading),route);}
 vm.runInContext('library()',ctx);assert.ok(node('#main').innerHTML.includes('第三轮 · 实机验收 0/6'));
 vm.runInContext("detail('G01')",ctx);assert.ok(node('#main').innerHTML.includes('第三轮 · 实机验收 0/6'));
 vm.runInContext('evidence()',ctx);assert.ok(node('#main').innerHTML.includes('39 同 / 10 改 / 1 新'));assert.ok(node('#main').innerHTML.includes(data.phase2.runtime_summary.sha256));assert.ok(node('#main').innerHTML.includes('有效玩法闭环：0'));
 vm.runInContext('cost()',ctx);assert.ok(node('#main').innerHTML.includes('第一轮研究历时'));assert.ok(node('#main').innerHTML.includes('第二轮历时（含网站）'));assert.ok(node('#main').innerHTML.includes('本轮完整总成本'));assert.ok(node('#main').innerHTML.includes('第三轮 · 新路径实机与公版网站'));
 assert.ok(vm.runInContext('phase3CostHTML()',ctx).includes(data.cost_phase3.artifact_validation_cutoff_utc||data.cost_phase3.delivery_readback_completed_at_utc?'第三轮已记录历时':'进行中'));assert.ok(node('#main').innerHTML.includes('未知'));
 vm.runInContext("selected=['G01','G02','G03'];compare()",ctx);assert.ok(node('#main').innerHTML.includes('compare-table'));
 vm.runInContext("libraryQuery='no_match_123';library()",ctx);assert.ok(node('#sample-grid').innerHTML.includes('没有匹配样本'));
 vm.runInContext("fieldStatus='observed';fieldQuery='';detail('G02')",ctx);assert.ok(node('#field-results').innerHTML.includes('没有符合条件的字段'));
});

test('phase-two adapter publishes only derived metadata, never embedded source or asset structures',()=>{
 assert.equal(data.phase2.function_comparison_count,72);
 assert.equal(data.phase2.changed_functions.length,15);
 assert.ok(data.phase2.changed_functions.every(f=>f.equal===false));
 const encoded=JSON.stringify(data.phase2);
 assert.ok(!encoded.includes('function('));assert.ok(!encoded.includes('__type__'));assert.ok(!encoded.includes('texture'));assert.ok(!encoded.includes('"code":'));
 assert.ok(data.phase2.fruits.every(f=>Object.keys(f).every(k=>['index','name','source_size','locator'].includes(k))));
});

test('phase-two version and runtime summaries preserve separate evidence scope',()=>{
 const v=data.phase2.version_summary.version_findings;
 assert.deepEqual([v.equal_modules,v.changed_existing_modules,v.new_modules.length],[39,10,1]);
 assert.equal(data.phase2.version_summary.customer_meaning_by_changed_module.length,11);
 assert.equal(data.phase2.runtime_summary.verified_gameplay_cycles,0);
 assert.equal(data.phase2.runtime_summary.observations.length,2);
 assert.ok(!JSON.stringify(data.phase2).includes('.jpg'));
 assert.equal(C.stats(data,'G01').static,13);assert.equal(C.stats(data,'G01').live,0);
});
test('phase-two cost ledger does not overwrite phase-one values or unknown costs',()=>{
 assert.equal(data.cost.elapsed_wall_seconds_to_delivery_readback,1472.403);
 assert.ok(data.cost_phase2.started_at_utc);
 assert.equal(data.cost.human_active_work_hours,null);
 assert.equal(data.cost_phase2.costs.total_cost_cny,null);
 assert.notEqual(data.cost.started_at_utc,data.cost_phase2.started_at_utc);
 assert.ok(!JSON.stringify(data).includes('runtime-phase3'));
});


test('phase-three acceptance preserves six unverified steps and an unknown runtime hash',()=>{
 const p=data.phase3;assert.equal(p.required_step_count,6);assert.equal(p.steps.length,6);
 assert.deepEqual(p.steps.map(s=>s.id),['drop','merge','score','failure','settlement','restart']);
 assert.ok(p.steps.every(s=>['pending','blocked'].includes(s.status)&&s.verified===false));
 assert.equal(p.verified_step_count,0);assert.equal(p.verified_gameplay_cycles,0);assert.equal(p.full_delivery_accepted,false);
 assert.equal(p.version_gate.actual_loaded_response_sha256,null);assert.equal(p.version_gate.exact_build_linkage_verified,false);
 assert.ok(p.diagnostics.proven.some(s=>s.includes('noWindowsAvailable')));
 assert.ok(p.diagnostics.unknown.some(s=>s.includes('灰屏原因')));
 assert.ok(!JSON.stringify(p).includes('internal_source_file'));
 assert.equal(data.cost_phase3.costs.total_cost_cny,null);
});
