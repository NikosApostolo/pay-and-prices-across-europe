import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { refreshSnapshot } from '../src/eurostat.js';

const snapshotPath = new URL('../public/snapshot.json', import.meta.url);
const tempPath = new URL('snapshot-' + randomUUID() + '.tmp', snapshotPath);
let previous;
try {
  try {
    previous = JSON.parse(await readFile(snapshotPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const snapshot = await refreshSnapshot({ previous });
  await writeFile(tempPath, JSON.stringify(snapshot) + '\n', { flag:'wx' });
  await rename(tempPath, snapshotPath);
  console.log('Published validated snapshot at ' + snapshot.refreshedAt);
  for (const [key, indicator] of Object.entries(snapshot.indicators)) {
    console.log(key, indicator.periods[0], indicator.updated, indicator.query);
  }
} catch (error) {
  console.error('Snapshot unchanged:', error.message);
  process.exitCode = 1;
} finally {
  await unlink(tempPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
