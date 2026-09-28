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
