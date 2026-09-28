import assert from 'node:assert/strict';
import { captureProject, projectPerformance, validateProject, LAYERS, STEP } from '../core/project.mjs';
const performance = {
  bars: 8, starts: [0, 4], markers: [{step:0,name:'Verse'},{step:64,name:'Chorus'}], map: [], gaps: [], keyUpAt: -1,
  ev: Object.fromEntries(LAYERS.map(layer => [layer, Array.from({length:128}, () => [])])), roll: {}
};
performance.ev.melody[60] = [[66, 8, .92, .86], [70, 4, .5, 1.02]];
performance.ev.chords[0] = [[[48, 55, 60], 16, .85, null]];
performance.ev.pad[64] = [[[48, 55, 63], 8]];
performance.ev.bass[16] = [[36, 16, 1]];
performance.ev.arp[20] = [[72, 2]];
performance.ev.drums[4] = [['s', .45], ['h', 1]];
performance.ev.perc[8] = [['sh', .45]];
performance.ev.fx[64] = [['sweep', 64], ['crash', 32]];
const args = {
  arrangement: { bpm: 120, styleId: 'jazz', sound: {lead:'sine'}, executionVersion:2, aiPlan:{title:'Original'} },
  sections: [{id:7,type:'verse',bars:4},{id:8,type:'chorus',bars:4}], performance,
  mixer: {vol:{melody:.8}}, projectId:'test-project'
};
const project = captureProject(args);
const restored = JSON.parse(JSON.stringify(project));
assert.deepEqual(projectPerformance(restored).ev, performance.ev, 'Serialization preserves every render event including grouped voices and section-crossing tails');
assert.equal(project.tracks[3].clips[0].events[0].startTick, 60*STEP);
assert.equal(project.tracks[3].clips[0].events[0].durationTicks, 8*STEP);
const again = captureProject({...args, previous:project});
assert.deepEqual(again, project, 'Identical materialization preserves IDs and revision');
const changed = captureProject({...args, arrangement:{...args.arrangement,bpm:124}, previous:project});
assert.equal(changed.revision, 1);
assert.equal(changed.projectId, project.projectId);
assert.deepEqual(changed.tracks, project.tracks, 'Tempo changes do not replace clip/event identities');
const revision = structuredClone(project);
revision.provenance.aiPlan.title = 'Unrelated provenance';
assert.deepEqual(projectPerformance(revision).ev, performance.ev, 'AI provenance never overrides current performance');
const edited = structuredClone(project);
edited.tracks[3].clips[0].events[0].pitch = 67;
const result = projectPerformance(edited);
assert.equal(result.ev.melody[60][0][0], 67, 'Current event edits reach the renderer');
for (const layer of LAYERS.filter(x=>x!=='melody')) assert.deepEqual(result.ev[layer], performance.ev[layer], 'An event edit leaves other tracks intact');
assert.deepEqual(projectPerformance(project).ev, performance.ev, 'Editing a copy preserves the source project');
const invalid = [
  p => { p.schemaVersion=99; },
  p => { p.tracks[3].clips[0].events[0].startTick=-STEP; },
  p => { p.tracks[3].clips[0].events[0].startTick=64*STEP; },
  p => { p.tracks[3].clips[0].events[0].pitch=128; },
  p => { p.tracks[3].clips[0].events[1].id=p.tracks[3].clips[0].events[0].id; },
  p => { p.tracks[0].clips[1].sectionId=p.sections[0].id; },
  p => { p.tracks[0].layer='bass'; },
  p => { p.sections[1].startTick=0; }
];
for (const corrupt of invalid) { const p=structuredClone(project); corrupt(p); assert.throws(()=>validateProject(p), /Invalid ARRO project/); }
console.log('Project serialization, identity, edit isolation, renderer round-trip, and 8 invalid-input checks passed');

const { applyCommand } = await import('../core/commands.mjs');
const tempo = applyCommand(project,{type:'set-tempo',tempo:126,baseRevision:0});
assert.equal(tempo.tempo,126);
assert.equal(tempo.revision,1);
assert.equal(project.tempo,120);
assert.deepEqual(tempo.tracks,project.tracks,'Tempo command preserves every event and identity');
assert.throws(()=>applyCommand(tempo,{type:'set-tempo',tempo:128,baseRevision:0}),/conflict/);
assert.throws(()=>applyCommand(project,{type:'set-tempo',tempo:999,baseRevision:0}),/Invalid/);
const mixed=applyCommand(tempo,{type:'set-mixer',trackId:'track:melody',mixer:{volume:.37,muted:true},baseRevision:1});
assert.equal(mixed.tracks[3].mixer.volume,.37);
assert.equal(mixed.tracks[3].mixer.muted,true);
assert.deepEqual(mixed.tracks[3].clips,tempo.tracks[3].clips);
for(const i of [0,1,2,4,5,6,7]) assert.deepEqual(mixed.tracks[i],tempo.tracks[i]);
assert.equal(applyCommand(mixed,{type:'set-tempo',tempo:126,baseRevision:2}),mixed,'No-op commands do not create revisions');
assert.throws(()=>applyCommand(mixed,{type:'set-mixer',trackId:'track:melody',mixer:{volume:-1},baseRevision:2}),/Invalid/);
console.log('Tempo/mixer commands preserve events, isolate edits, and reject invalid or stale commands');

const clip=project.tracks[3].clips[0], event=clip.events[0];
const noteCommand={type:'update-note',trackId:'track:melody',clipId:clip.id,eventId:event.id,baseRevision:0,patch:{pitch:67,startTick:58*STEP,durationTicks:4*STEP,velocity:.51}};
const noteEdit=applyCommand(project,noteCommand);
assert.deepEqual(noteEdit.tracks.filter(t=>t.layer!=='melody'),project.tracks.filter(t=>t.layer!=='melody'));
assert.deepEqual(noteEdit.tracks[3].clips[1],project.tracks[3].clips[1]);
assert.equal(noteEdit.tracks[3].clips[0].events[0].id,event.id);
assert.equal(noteEdit.tracks[3].clips[0].edited,true);
assert.equal(projectPerformance(noteEdit).ev.melody[58][0][0],67);
assert.equal(projectPerformance(noteEdit).roll.melody[0].velocity,51);
assert.equal(projectPerformance(noteEdit).roll.melody[0].exactTiming,true);
for(const patch of [{pitch:128},{pitch:60.5},{startTick:-120},{startTick:63*STEP,durationTicks:8*STEP},{velocity:2},{durationTicks:0}]) assert.throws(()=>applyCommand(project,{...noteCommand,patch}));
assert.throws(()=>applyCommand(noteEdit,noteCommand),/conflict/);
const deleted=applyCommand(noteEdit,{type:'delete-note',trackId:'track:melody',clipId:clip.id,eventId:event.id,baseRevision:1});
assert.equal(deleted.tracks[3].clips[0].events.length,clip.events.length-1);
assert.equal(project.tracks[3].clips[0].events.length,2,'Commands never mutate the original');
const preserved=captureProject({...args,previous:noteEdit,preserveEdited:true});
assert.deepEqual(preserved.tracks[3].clips[0].events,noteEdit.tracks[3].clips[0].events,'Legacy recompilation retains hand-edited clips');
assert.deepEqual(captureProject({...args,previous:deleted,preserveEdited:true}).tracks[3].clips[0].events,deleted.tracks[3].clips[0].events,'Deleted notes stay deleted on recompilation');
assert.doesNotThrow(()=>applyCommand(project,{...noteCommand,patch:{pitch:68}}),'Existing cross-section tails survive pitch-only editing');
console.log('Scoped note movement, pitch, duration, velocity, deletion, bounds, conflicts, and recompilation preservation passed');

const empty=applyCommand(deleted,{type:'delete-note',trackId:'track:melody',clipId:clip.id,eventId:deleted.tracks[3].clips[0].events[0].id,baseRevision:2});
assert.equal(captureProject({...args,previous:empty,preserveEdited:true}).tracks[3].clips[0].events.length,0,'A manually emptied clip stays silent');
assert.deepEqual(projectPerformance(captureProject({...args,performance:projectPerformance(noteEdit)})).ev,projectPerformance(noteEdit).ev,'Explicit timing and velocity survive rematerialization');
