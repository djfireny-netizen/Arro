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
export function captureProject({ arrangement, sections, performance, mixer = {}, previous = null, projectId = crypto.randomUUID() }) {
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
              render: { groupId, voice, rowLength: row.length, ...(row[3] !== undefined ? { articulation: row[3] } : {}) }
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
  if (!Number.isFinite(project.tempo) || project.tempo <= 0) fail('tempo');
  if (JSON.stringify(project.timeSignature) !== '[4,4]') fail('time signature');
  const ids = new Set();
  const unique = id => { if (typeof id !== 'string' || !id || ids.has(id)) fail('duplicate or missing ID'); ids.add(id); };
  const tick = n => Number.isInteger(n) && n >= 0 && n % STEP === 0;
  let end = 0;
  for (const s of project.sections) {
    unique(s.id);
    if (s.startTick !== end || !tick(s.durationTicks) || s.durationTicks <= 0) fail('section range');
    end += s.durationTicks;
  }
  if (!end) fail('empty form');
  if (project.tracks.length !== LAYERS.length) fail('track count');
  const layers = new Set();
  for (const track of project.tracks) {
    unique(track.id);
    if (!LAYERS.includes(track.layer) || layers.has(track.layer)) fail('track layer');
    layers.add(track.layer);
    if (track.clips.length !== project.sections.length) fail('clip count');
    const seenSections = new Set();
    for (const clip of track.clips) {
      unique(clip.id);
      const section = project.sections.find(s => s.id === clip.sectionId);
      if (!section || seenSections.has(section.id) || clip.startTick !== section.startTick || clip.durationTicks !== section.durationTicks) fail('clip range');
      seenSections.add(section.id);
      for (const event of clip.events) {
        unique(event.id);
        if (!tick(event.startTick) || event.startTick >= clip.durationTicks || !tick(event.durationTicks) || event.durationTicks <= 0) fail('event range');
        // Sustained notes/effect tails may cross a section boundary, as in the legacy renderer.
        if (pitched(track.layer)) {
          if (event.type !== 'note' || !Number.isInteger(event.pitch) || event.pitch < 0 || event.pitch > 127) fail('note');
          if (!Number.isFinite(event.velocity) || event.velocity < 0) fail('velocity');
          if (!event.render || typeof event.render.groupId !== 'string' || !Number.isInteger(event.render.voice) || event.render.voice < 0) fail('render group');
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
            const key = JSON.stringify([r.groupId, step, len, event.velocity, r.articulation]);
            let row = groups.get(key);
            if (!row) {
              row = [[], len];
              if (r.rowLength >= 3) row.push(event.velocity);
              if (r.rowLength >= 4) row.push(r.articulation ?? null);
              groups.set(key, row); ev[layer][step].push(row);
            }
            row[0].push(event.pitch);
          } else {
            const row = [event.pitch, len];
            if (r.rowLength >= 3) row.push(event.velocity);
            if (r.rowLength >= 4) row.push(r.articulation ?? null);
            ev[layer][step].push(row);
          }
          roll[layer].push({ step, len, midi: event.pitch, ...(layer === 'melody' ? { k: event.velocity } : {}) });
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
