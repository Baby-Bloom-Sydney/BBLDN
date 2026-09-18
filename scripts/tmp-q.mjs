import pg from "pg";
const c = new pg.Client({connectionString:"postgresql://postgres:postgres@127.0.0.1:54322/postgres"});
await c.connect();
const r = await c.query(process.argv[2]);
console.log(r.rows.map(x=>Object.values(x).map(v=>v===null?"∅":String(v)).join(" | ")).join("\n"));
await c.end();
