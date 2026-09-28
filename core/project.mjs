// ProjectV2 stores the realized performance. AI plans are provenance only.
export const PPQ = 480;
export const STEP = PPQ / 4;
export const LAYERS = ['drums', 'bass', 'chords', 'melody', 'arp', 'pad', 'perc', 'fx'];
const DRUMS = ['k', 's', 'c', 'h', 'o'];
const PERC = ['sh', 'tb', 'cg', 'cl', 'rm'];
const clone = value => structuredClone(value);
const pitched = layer => !['drums', 'perc', 'fx'].includes(layer);
const grouped = layer => ['chords', 'pad'].includes(layer);

// Section IDs follow the existing editor identity, including after reordering.
// Event IDs remain stable while that section's realized event slots are unchanged.
export function captureProject({ arrangement, sections, performance, mixer = {}, previous = null, preserveEdited = false, projectId = crypto.randomUUID() }) {
  const id = previous?.projectId ?? projectId;
  const sectionList = sections.map((s, i) => ({
    id: `section:${s.id}`, type: s.type, startTick: performance.starts[i] * 16 * STEP,
    durationTicks: s.bars * 16 * STEP
  }));
  const tracks = LAYERS.map(layer => ({
    id: `track:${layer}`, layer,
    instrument: { style: arrangement.styleId, sound: clone(arrangement.sound) },
    mixer: { volume: mixer.vol?.[layer] ?? 1, muted: !!mixer.muted?.[layer] },
    clips: sectionList.map(section => {
      const clipId = `${section.id}:${layer}`;
      const events = [];
      const from = section.startTick / STEP, until = from + section.durationTicks / STEP;
      for (let step = from; step < until; step++) {
        for (const [slot, row] of (performance.ev[layer][step] ?? []).entries()) {
          const startTick = (step - from) * STEP;
          const groupId = `${clipId}:${startTick}:${slot}`;
          if (pitched(layer)) {
            const notes = grouped(layer) ? row[0] : [row[0]];
            notes.forEach((pitch, voice) => events.push({
              id: `${groupId}:${voice}`, type: 'note', startTick, durationTicks: row[1] * STEP,
              pitch, velocity: row[2] ?? 1,
              render: { groupId, voice, rowLength: Math.min(4,row.length), ...(row[4]?.userVelocity?{userVelocity:true}:{}), ...(row[4]?.userTiming?{userTiming:true}:{}), ...(row[3] !== undefined ? { articulation: row[3] } : {}) }
            }));
          } else if (layer === 'fx') {
            events.push({ id: groupId, type: 'effect', startTick, durationTicks: row[1] * STEP, effect: row[0] });
          } else {
            events.push({ id: groupId, type: 'drum', startTick, durationTicks: STEP, lane: row[0], velocity: row[1] });
          }
        }
      }
      return { id: clipId, sectionId: section.id, startTick: section.startTick, durationTicks: section.durationTicks, events };
    })
  }));
  const project = {
    schemaVersion: 2, projectId: id, revision: previous?.revision ?? 0,
    title: arrangement.title ?? '', tempo: arrangement.bpm, timeSignature: [4, 4], ticksPerQuarter: PPQ,
    sections: sectionList, tracks,
    render: { version: 'legacy-audio-v1', executionVersion: arrangement.executionVersion ?? 1,
      // Audio humanization/noise is still stochastic; event materialization is deterministic.
      deterministicAudio: false, metadata: clone(Object.fromEntries(Object.entries(performance).filter(([key]) => !['ev', 'roll'].includes(key)))) },
    provenance: { aiPlan: clone(arrangement.aiPlan ?? null) }
  };
  if (preserveEdited && previous) {
    for(const track of project.tracks) for(let i=0;i<track.clips.length;i++) {
      const clip=track.clips[i], old=previous.tracks.find(t=>t.id===track.id)?.clips.find(c=>c.id===clip.id);
      if(!old?.edited) continue;
      if(clip.durationTicks<old.durationTicks && old.events.some(e=>e.startTick+e.durationTicks>clip.durationTicks)) throw new Error('这段有手动编辑的音符超出新长度，请先调整音符');
      track.clips[i]={...clone(old),startTick:clip.startTick,durationTicks:clip.durationTicks};
    }
  }
  if (previous && projectContent(project) !== projectContent(previous)) project.revision++;
  validateProject(project);
  return project;
}

export function projectContent(project) {
  const { revision, ...content } = project;
  return JSON.stringify(content);
}

export function validateProject(project) {
  const fail = message => { throw new Error(`Invalid ARRO project: ${message}`); };
  if (project?.schemaVersion !== 2 || project.ticksPerQuarter !== PPQ) fail('unsupported schema');
  if (typeof project.projectId !== 'string' || !project.projectId || !Number.isInteger(project.revision) || project.revision < 0) fail('identity');
  if (!Number.isFinite(project.tempo) || project.tempo < 60 || project.tempo > 180) fail('tempo');
  if (JSON.stringify(project.timeSignature) !== '[4,4]') fail('time signature');
  if (!Array.isArray(project.sections) || !project.sections.length || project.sections.length > 24 || !Array.isArray(project.tracks)) fail('structure');
  if (project.render?.version !== 'legacy-audio-v1' || ![1,2].includes(project.render.executionVersion)) fail('renderer');
  const ids = new Set();
  const unique = id => { if (typeof id !== 'string' || !id || ids.has(id)) fail('duplicate or missing ID'); ids.add(id); };
  const tick = n => Number.isInteger(n) && n >= 0 && n % STEP === 0;
  let end = 0;
  for (const s of project.sections) {
    unique(s.id);
    if (s.startTick !== end || !tick(s.durationTicks) || s.durationTicks <= 0 || s.durationTicks > 8 * 16 * STEP) fail('section range');
    end += s.durationTicks;
  }
  if (!end) fail('empty form');
  const meta = project.render.metadata;
  if (!meta || meta.bars !== end / (16 * STEP) || !Array.isArray(meta.starts) || meta.starts.length !== project.sections.length || meta.starts.some((bar,i)=>bar !== project.sections[i].startTick/(16*STEP)) || !Array.isArray(meta.map) || !Array.isArray(meta.markers) || !Array.isArray(meta.gaps)) fail('render metadata');
  if (meta.markers.some(m=>!Number.isInteger(m.step)||m.step<0||m.step>=end/STEP||typeof m.name!=='string')) fail('markers');
  if (project.tracks.length !== LAYERS.length) fail('track count');
  const layers = new Set();
  for (const track of project.tracks) {
    unique(track.id);
    if (!LAYERS.includes(track.layer) || layers.has(track.layer)) fail('track layer');
    layers.add(track.layer);
    if (!track.mixer || !Number.isFinite(track.mixer.volume) || track.mixer.volume < 0 || track.mixer.volume > 1 || typeof track.mixer.muted !== 'boolean') fail('mixer');
    if (!Array.isArray(track.clips) || track.clips.length !== project.sections.length) fail('clip count');
    const seenSections = new Set();
    for (const clip of track.clips) {
      unique(clip.id);
      const section = project.sections.find(s => s.id === clip.sectionId);
      if (!section || seenSections.has(section.id) || clip.startTick !== section.startTick || clip.durationTicks !== section.durationTicks) fail('clip range');
      seenSections.add(section.id);
      if (clip.edited !== undefined && typeof clip.edited !== 'boolean') fail('edited marker');
      if (!Array.isArray(clip.events) || clip.events.length > 16000) fail('events');
      for (const event of clip.events) {
        unique(event.id);
        if (!tick(event.startTick) || event.startTick >= clip.durationTicks || !tick(event.durationTicks) || event.durationTicks <= 0 || event.durationTicks > 128 * STEP) fail('event range');
        // Sustained notes/effect tails may cross a section boundary, as in the legacy renderer.
        if (pitched(track.layer)) {
          if (event.type !== 'note' || !Number.isInteger(event.pitch) || event.pitch < 0 || event.pitch > 127) fail('note');
          if (!Number.isFinite(event.velocity) || event.velocity < 0 || event.velocity > 4) fail('velocity');
          if (!event.render || typeof event.render.groupId !== 'string' || !Number.isInteger(event.render.voice) || event.render.voice < 0) fail('render group');
          for(const key of ['userVelocity','userTiming']) if(event.render[key] !== undefined && typeof event.render[key] !== 'boolean') fail('edit marker');
          if (![2,3,4].includes(event.render.rowLength)) fail('render row');
          if (event.render.articulation != null && !(track.layer === 'chords' ? ['D','U'].includes(event.render.articulation) : Number.isFinite(event.render.articulation) && event.render.articulation >= 0 && event.render.articulation <= 4)) fail('articulation');
        } else if (track.layer === 'fx') {
          if (event.type !== 'effect' || !['crash', 'riser', 'down', 'sweep'].includes(event.effect)) fail('effect');
        } else if (event.type !== 'drum' || !(track.layer === 'drums' ? DRUMS : PERC).includes(event.lane) || !Number.isFinite(event.velocity) || event.velocity < 0) fail('drum');
      }
    }
  }
  return project;
}

// Compatibility boundary: both the audio scheduler and MIDI exporter receive
// events reconstructed from the same project; the old renderer remains intact.
export function projectPerformance(project) {
  validateProject(project);
  const steps = project.sections.reduce((n, s) => n + s.durationTicks / STEP, 0);
  const ev = Object.fromEntries(LAYERS.map(layer => [layer, Array.from({ length: steps }, () => [])]));
  const roll = Object.fromEntries(LAYERS.map(layer => [layer, []]));
  for (const track of project.tracks) {
    const layer = track.layer;
    for (const clip of track.clips) {
      const groups = new Map();
      for (const event of clip.events) {
        const step = (clip.startTick + event.startTick) / STEP, len = event.durationTicks / STEP;
        if (event.type === 'note') {
          const r = event.render;
          if (grouped(layer)) {
            const key = JSON.stringify([r.groupId, step, len, event.velocity, r.articulation, r.userVelocity, r.userTiming]);
            let row = groups.get(key);
            if (!row) {
              row = [[], len];
              if (r.rowLength >= 3 || r.userVelocity || r.userTiming) row.push(event.velocity);
              if (r.rowLength >= 4 || r.userVelocity || r.userTiming) row.push(r.articulation ?? null);
              if(r.userVelocity||r.userTiming) row.push({userVelocity:!!r.userVelocity,userTiming:!!r.userTiming});
              groups.set(key, row); ev[layer][step].push(row);
            }
            row[0].push(event.pitch);
          } else {
            const row = [event.pitch, len];
            if (r.rowLength >= 3 || r.userVelocity || r.userTiming) row.push(event.velocity);
            if (r.rowLength >= 4 || r.userVelocity || r.userTiming) row.push(r.articulation ?? null);
            if(r.userVelocity||r.userTiming) row.push({userVelocity:!!r.userVelocity,userTiming:!!r.userTiming});
            ev[layer][step].push(row);
          }
          roll[layer].push({ step, len, midi: event.pitch, ...(layer === 'melody' ? { k: event.velocity } : {}), ...(r.userVelocity ? {velocity:Math.round(event.velocity*100)} : {}), ...(r.userTiming?{exactTiming:true}:{}) });
        } else if (event.type === 'drum') {
          ev[layer][step].push([event.lane, event.velocity]);
          roll[layer].push({ step, lane: (layer === 'drums' ? DRUMS : PERC).indexOf(event.lane), v: event.velocity });
        } else {
          ev.fx[step].push([event.effect, len]);
          roll.fx.push({ step, len, type: event.effect });
        }
      }
    }
  }
  return { ...clone(project.render.metadata), ev, roll };
}
