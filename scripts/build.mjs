import { mkdir, readFile, writeFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url),'utf8');
const dist = new URL('../dist/',import.meta.url);
const publicFiles = ['index.html','styles.css','app.js','model.js','definitions.js','snapshot.json'];
const assets = Object.fromEntries(await Promise.all(publicFiles.map(async file => ['/' + file,await read('public/' + file)])));
const hosting = await read('.openai/hosting.json');
const modules = await Promise.all(['public/definitions.js','src/eurostat.js','src/worker.js'].map(read));
// Both internal imports are single-line named imports. The build combines them into one Worker module.
const bundled = modules.map(source => source.replace(/^import .*;\r?\n/gm,'')).join('\n');
await mkdir(new URL('server/',dist),{recursive:true});
await mkdir(new URL('.openai/',dist),{recursive:true});
await writeFile(new URL('server/index.js',dist),bundled + '\nexport default createWorker(' + JSON.stringify(assets) + ');\n');
await writeFile(new URL('.openai/hosting.json',dist),hosting);
console.log('Built the application and its initial Eurostat snapshot.');
