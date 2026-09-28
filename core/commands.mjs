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
  } else throw new Error('Unsupported project command');
  if (JSON.stringify(next) === JSON.stringify(project)) return project;
  next.revision++;
  return validateProject(next);
}
