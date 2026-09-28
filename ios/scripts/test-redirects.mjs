import http from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
let leaked = 0;
const trap = http.createServer((req, res) => { leaked++; res.end('{}'); });
await new Promise(resolve => trap.listen(0, '127.0.0.1', resolve));
const source = http.createServer((req, res) => {
  if (req.url === '/api/info') {
    assert.equal(req.headers.authorization, undefined);
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ product: 'relay-clipboard', protocolVersion: 3, pairingLinkVersion: 2, e2eeVersion: 1 }));
  }
  const code = req.url === '/api/events?v=3' ? 302 : Number(req.url.split('/').at(-1));
  assert.equal(req.headers.authorization, 'Bearer fake-test-credential');
  res.writeHead(code, { Location: `http://127.0.0.1:${trap.address().port}/trap` }); res.end();
});
await new Promise(resolve => source.listen(0, '127.0.0.1', resolve));
try {
  const child = spawn('/tmp/relay-pairing-tests', { stdio: 'inherit', env: { ...process.env, REDIRECT_TEST_URL: `http://127.0.0.1:${source.address().port}` } });
  const status = await new Promise(resolve => child.on('exit', resolve));
  assert.equal(status, 0); assert.equal(leaked, 0, 'Redirect destination must receive zero requests');
} finally { source.close(); trap.close(); }
