import { validateProject } from './project.mjs';
const PITCHED = ['melody','bass','chords','arp','pad'];
const fields = ['pitch','startTick','durationTicks','velocity'];
export function revisionTarget(project, scope) {
  validateProject(project);
  const track=project.tracks.find(t=>t.id===scope?.trackId);
  const clip=track?.clips.find(c=>c.id===scope?.clipId);
  if(!clip || !PITCHED.includes(track.layer)) throw new Error('Invalid revision scope');
  return {track,clip};
}
// The model receives current realized events, including manual edits, and nearby arrangement context.
export function revisionContext(project, scope) {
  const {track,clip}=revisionTarget(project,scope);
  const index=project.sections.findIndex(s=>s.id===clip.sectionId);
  const sections=project.sections.slice(Math.max(0,index-1),index+2);
  const context={projectId:project.projectId,baseRevision:project.revision,trackId:track.id,clipId:clip.id,
    title:project.title,tempo:project.tempo,ticksPerQuarter:480,gridTicks:120,
    target:{layer:track.layer,sectionId:clip.sectionId,durationTicks:clip.durationTicks},
    form:project.sections,sections:sections.map(s=>({...s,tracks:project.tracks.map(t=>({layer:t.layer,mixer:t.mixer,
      events:t.clips.find(c=>c.sectionId===s.id).events.map(e=>Object.fromEntries(Object.entries(e).filter(([k])=>!['id','render'].includes(k))))}))}))};
  if(JSON.stringify(context).length>180000) throw new Error('Selected context is too large');
  return context;
}
export function replacementEvents(project, scope, candidate) {
  const {clip}=revisionTarget(project,scope);
  const allowed=['projectId','baseRevision','trackId','clipId','notes','explanation'];
  if(!candidate || Object.keys(candidate).some(k=>!allowed.includes(k)) || candidate.projectId!==project.projectId || candidate.baseRevision!==project.revision || candidate.trackId!==scope.trackId || candidate.clipId!==scope.clipId) throw new Error('Revision identity or scope conflict');
  if(typeof candidate.explanation!=='string'||candidate.explanation.length>1000||!Array.isArray(candidate.notes)||candidate.notes.length>512) throw new Error('Invalid revision response');
  return candidate.notes.map((n,i)=>{
    if(!n||Object.keys(n).length!==4||Object.keys(n).some(k=>!fields.includes(k))||!Number.isInteger(n.pitch)||n.pitch<0||n.pitch>127||![n.startTick,n.durationTicks].every(x=>Number.isInteger(x)&&x%120===0)||n.startTick<0||n.durationTicks<=0||n.startTick+n.durationTicks>clip.durationTicks||!Number.isFinite(n.velocity)||n.velocity<.01||n.velocity>1.27) throw new Error('Invalid replacement note');
    const id=`${clip.id}:revision:${project.revision+1}:${i}`;
    return {id,type:'note',...n,render:{groupId:id,voice:0,rowLength:3,userTiming:true,userVelocity:true}};
  });
}
