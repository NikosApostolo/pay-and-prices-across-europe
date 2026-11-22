import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const mime = { html:'text/html;charset=utf-8', css:'text/css;charset=utf-8', js:'text/javascript;charset=utf-8', json:'application/json' };
const allowed = new Set(['index.html','styles.css','app.js','model.js','definitions.js','snapshot.json']);
const { values } = parseArgs({options:{port:{type:'string'},host:{type:'string'},strictPort:{type:'boolean'}}});
const port = Number(values.port ?? process.env.PORT ?? 8000);
const host = values.host ?? process.env.HOST ?? '0.0.0.0';
createServer(async (request,response) => {
  const url = new URL(request.url,'http://localhost');
  const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!allowed.has(path) || !['GET','HEAD'].includes(request.method)) {
    response.writeHead(404).end('Not found');
    return;
  }
  const file = fileURLToPath(new URL('../public/' + path,import.meta.url));
  try {
    const info = await stat(file);
    response.writeHead(200,{
      'Content-Type':mime[path.split('.').at(-1)], 'Content-Length':info.size, 'Cache-Control':'no-cache',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error',() => response.destroy()).pipe(response);
  } catch {
    response.writeHead(404).end('File unavailable');
  }
}).listen(port,host,() => console.log('European Living Standards Dashboard listening on port ' + port));
