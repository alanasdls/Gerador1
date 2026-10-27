import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Exercise the real migration and SQL. Only the D1 transport is adapted.
export function testEnvironment() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  for(const file of readdirSync(new URL('./migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('./migrations/'+file,import.meta.url),'utf8'));
  const root = fileURLToPath(new URL('./public/', import.meta.url));
  const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.webmanifest':'application/manifest+json'};
  const DB = {
    prepare(sql) {
      const statement = sqlite.prepare(sql.replace(/\?(\d+)/g, (_, i) => '$p'+i));
      let values = {};
      return {
        bind(...args) { values = Object.fromEntries(args.map((v,i)=>['p'+(i+1),v])); return this; },
        async first() { return statement.get(values) || null; },
        async all() { return {results:statement.all(values)}; },
        async run() { return statement.run(values); }
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try { const result=[]; for(const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result; }
      catch(error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  };
  const ASSETS = {async fetch(request) {
    const pathname=decodeURIComponent(new URL(request.url).pathname);
    const filename=path.resolve(root,'.'+pathname);
    if(!filename.startsWith(root))return new Response(null,{status:404});
    try {return new Response(readFileSync(filename),{headers:{'content-type':mime[path.extname(filename)]||'application/octet-stream'}});}
    catch {return new Response(null,{status:404});}
  }};
  return {DB,ASSETS,sqlite};
}
