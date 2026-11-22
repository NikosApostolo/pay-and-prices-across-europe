import { refreshSnapshot } from './eurostat.js';

const snapshotKey = 'eurostat-snapshot-v1.json';

function json(value, status = 200) {
  return Response.json(value,{ status, headers:{ 'Cache-Control':'no-store' } });
}

async function current(bucket, seed) {
  const object = await bucket?.get(snapshotKey);
  return { object, snapshot:object ? await object.json() : JSON.parse(seed) };
}

export async function publishSnapshot(bucket, seed, fetcher = fetch) {
  if (!bucket) throw new Error('The persistent snapshot store is unavailable');
  const { object, snapshot } = await current(bucket, seed);
  const updated = await refreshSnapshot({ previous:snapshot, fetcher });
  const saved = await bucket.put(snapshotKey, JSON.stringify(updated), {
    onlyIf: object ? { etagMatches:object.etag } : { etagDoesNotMatch:'*' },
    httpMetadata:{ contentType:'application/json' },
  });
  if (!saved) {
    const latest = await current(bucket, seed);
    return { published:false, ...summary(latest.snapshot) };
  }
  const readback = await bucket.get(snapshotKey);
  if (!readback) throw new Error('Publication could not be verified');
  return { published:true, ...summary(await readback.json()) };
}

function summary(snapshot) {
  return {
    lastSuccessfulRefresh:snapshot.refreshedAt,
    latestSourcePeriods:Object.fromEntries(Object.entries(snapshot.indicators).map(([key, data]) => [key,data.periods[0]])),
  };
}

const toolList = [
  { name:'refresh_eurostat_snapshot',
    description:'Fetch all six filtered Eurostat Statistics API datasets, validate the history and atomically publish the dashboard snapshot. Use the status tool to check the published result.',
    inputSchema:{type:'object',properties:{},additionalProperties:false} },
  { name:'get_eurostat_snapshot_status',
    description:'Read the dashboard’s persisted snapshot timestamp and latest source periods.',
    inputSchema:{type:'object',properties:{},additionalProperties:false} },
];

async function mcp(request, bucket, seed) {
  let body;
  try { body = await request.json(); }
  catch { return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}},400); }
  const { method, id, params } = body ?? {};
  const result = value => json({jsonrpc:'2.0',id:id ?? null,result:value});
  const error = (code,message) => json({jsonrpc:'2.0',id:id ?? null,error:{code,message}});
  if (method === 'server/discover') return result({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
  if (method === 'initialize') return result({
    protocolVersion:['2025-03-26','2025-06-18','2025-11-25'].includes(params?.protocolVersion) ? params.protocolVersion : '2025-11-25',
    serverInfo:{name:'European Living Standards',version:'1.0.0'},capabilities:{tools:{}},
  });
  if (method === 'notifications/initialized') return new Response(null,{status:202});
  if (method === 'ping') return result({});
  if (method === 'tools/list') return result({tools:toolList});
  if (method !== 'tools/call') return error(-32601,'Unknown method');
  const content = (text, isError = false) => result({content:[{type:'text',text:typeof text === 'string' ? text : JSON.stringify(text)}],isError});
  try {
    if (params?.name === 'get_eurostat_snapshot_status') return content(summary((await current(bucket,seed)).snapshot));
    if (params?.name === 'refresh_eurostat_snapshot') {
      // Sites authenticates MCP calls and limits this private site's access to the owner.
      return content(await publishSnapshot(bucket,seed));
    }
    return error(-32602,'Unknown tool');
  } catch (failure) {
    return content('Eurostat refresh or status check failed. ' + failure.message, true);
  }
}

const contentTypes = {
  html:'text/html;charset=utf-8',css:'text/css;charset=utf-8',js:'text/javascript;charset=utf-8',
};
export function createWorker(assets) {
  return {
    async fetch(request, env = {}) {
      const path = new URL(request.url).pathname;
      const seed = assets['/snapshot.json'];
      if (request.method === 'POST' && path === '/mcp') return mcp(request,env.BUCKET,seed);
      if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
      if (path === '/snapshot.json') {
        try {
          const object = await env.BUCKET?.get(snapshotKey);
          return new Response(request.method === 'HEAD' ? null : object?.body ?? seed,{
            headers:{'Content-Type':'application/json','Cache-Control':'no-cache'},
          });
        } catch {
          return json({error:'The snapshot store is temporarily unavailable'},503);
        }
      }
      const asset = path === '/' ? '/index.html' : path;
      if (!Object.hasOwn(assets,asset)) return new Response('Not found',{status:404});
      return new Response(request.method === 'HEAD' ? null : assets[asset],{
        headers:{
          'Content-Type':contentTypes[asset.split('.').at(-1)] ?? 'text/plain;charset=utf-8',
          'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff',
          'Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'",
        },
      });
    },
  };
}
