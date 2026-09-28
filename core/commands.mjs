import { replacementEvents } from './revision.mjs';
import { validateProject } from './project.mjs';

// Commands are copy-on-write and reject stale requests before changing anything.
export function applyCommand(project, command) {
  validateProject(project);
  if (command.baseRevision !== project.revision) throw new Error('Project revision conflict');
  const next = structuredClone(project);
  if (command.type === 'set-tempo') {
    if (!Number.isInteger(command.tempo) || command.tempo < 60 || command.tempo > 180) throw new Error('Invalid tempo');
    next.tempo = command.tempo;
  } else if (command.type === 'set-mixer') {
    const track = next.tracks.find(t => t.id === command.trackId);
    if (!track || !command.mixer || Object.keys(command.mixer).some(k => !['volume', 'muted'].includes(k))) throw new Error('Invalid mixer target');
    if ('volume' in command.mixer && (!Number.isFinite(command.mixer.volume) || command.mixer.volume < 0 || command.mixer.volume > 1)) throw new Error('Invalid volume');
    if ('muted' in command.mixer && typeof command.mixer.muted !== 'boolean') throw new Error('Invalid mute');
    Object.assign(track.mixer, command.mixer);
  } else if (['update-note','delete-note'].includes(command.type)) {
    const track=next.tracks.find(t=>t.id===command.trackId);
    const clip=track?.clips.find(c=>c.id===command.clipId);
    const event=clip?.events.find(e=>e.id===command.eventId);
    if(!event || event.type!=='note') throw new Error('Invalid note target');
    if(command.type==='delete-note') clip.events=clip.events.filter(e=>e.id!==event.id);
    else {
      const patch=command.patch;
      if(!patch || !Object.keys(patch).length || Object.keys(patch).some(k=>!['pitch','startTick','durationTicks','velocity'].includes(k))) throw new Error('Invalid note edit');
      if('velocity' in patch && (!Number.isFinite(patch.velocity)||patch.velocity<.01||patch.velocity>1.27)) throw new Error('Invalid note velocity');
      const sameTiming=(patch.startTick??event.startTick)===event.startTick&&(patch.durationTicks??event.durationTicks)===event.durationTicks;
      Object.assign(event,patch);
      if(!sameTiming&&event.startTick+event.durationTicks>clip.durationTicks) throw new Error('Note extends beyond this section');
      if('velocity' in patch) event.render.userVelocity=true;
      if('durationTicks' in patch) event.render.userTiming=true;
    }
    clip.edited=true;
  } else if(command.type==='replace-clip') {
    const events=replacementEvents(project,command,command.candidate);
    const clip=next.tracks.find(t=>t.id===command.trackId).clips.find(c=>c.id===command.clipId);
    clip.events=events;clip.edited=true;
  } else throw new Error('Unsupported project command');
  if (JSON.stringify(next) === JSON.stringify(project)) return project;
  next.revision++;
  return validateProject(next);
}
