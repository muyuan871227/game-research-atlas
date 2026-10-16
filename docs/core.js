(function(root){
'use strict';
const labels={observed:'实机观察',static_verified:'静态验证',inferred:'推断',not_observed:'未观察到',blocked:'受阻',unknown:'未知',not_collected:'待采集'};
function filterSamples(samples,search='',genre='all'){const q=search.trim().toLowerCase();return samples.filter(s=>(genre==='all'||s.selection_genre===genre)&&(!q||[s.name,s.sample_id,s.selection_genre,...s.channel_candidates].join(' ').toLowerCase().includes(q)));}
function toggleCompare(ids,id){if(ids.includes(id))return {ids:ids.filter(x=>x!==id),error:null};if(ids.length>=3)return {ids:[...ids],error:'最多对比 3 款，请先移除一款。'};return {ids:[...ids,id],error:null};}
function observation(data,id,field){return data.observations.find(o=>o.sample_id===id&&o.field_id===field)||{sample_id:id,field_id:field,status:'unknown',value:null,evidence_ids:[],limitations:['尚未执行该字段的拆解。']};}
function stats(data,id){const rows=id?data.observations.filter(o=>o.sample_id===id):data.observations;return {static:rows.filter(o=>o.status==='static_verified').length,live:rows.filter(o=>o.status==='observed').length,blocked:rows.filter(o=>o.status==='blocked').length,fields:data.dimensions.reduce((n,d)=>n+d.fields.length,0)};}
function matchedFields(data,id,status='all',query=''){const q=query.trim().toLowerCase();return data.dimensions.map(d=>({...d,fields:d.fields.filter(f=>{const o=observation(data,id,f.id);return (status==='all'||o.status===status)&&(!q||(f.question+' '+f.id+' '+JSON.stringify(o.value||'')).toLowerCase().includes(q));})})).filter(d=>d.fields.length);}
function escapeHTML(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

const runtimeStepIds=['drop','merge','score','failure','settlement','restart'];
function runtimeStatus(delivery={}){const steps=delivery.steps||[],verified=runtimeStepIds.filter(id=>steps.some(s=>s.id===id&&s.verified===true&&s.status==='verified')).length;const version=delivery.version_gate||{},codeMatched=!!version.actual_loaded_response_sha256&&version.actual_loaded_response_sha256===version.analyzed_project_sha256&&version.actual_loaded_response_status==='captured_and_matched';return {verified,total:6,coreAccepted:verified===6&&delivery.core_loop_delivery_accepted===true&&codeMatched&&delivery.integrity?.passed===true,fullAccepted:delivery.full_delivery_accepted===true,exactBuild:version.exact_build_linkage_verified===true,codeMatched};}
function runtimeStep(delivery,id){const steps=delivery?.steps||[];return steps.find(s=>s.id===id)||steps[0]||null;}
function mediaPath(path){return typeof path==='string'&&/^media\/g01\/[a-z0-9-]+\.(png|webm)$/.test(path)?path:'';}
function videoTime(step){return typeof step?.video_seconds==='number'&&Number.isFinite(step.video_seconds)&&step.video_seconds>=0?step.video_seconds:null;}
function parseRoute(hash){const [path,query='']=String(hash||'').replace(/^#/,'').split('?');const [page,arg]=path.split('/');const params=new URLSearchParams(query);return {page:page||'workbench',arg,step:params.get('step')||'drop',view:params.get('view')==='video'?'video':'image'};}
const api={runtimeStatus,runtimeStep,mediaPath,videoTime,parseRoute,labels,filterSamples,toggleCompare,observation,stats,matchedFields,escapeHTML};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ResearchCore=api;
})(globalThis);
