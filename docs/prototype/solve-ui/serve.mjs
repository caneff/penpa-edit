// PROTOTYPE (throwaway, branch prototype/solve-ui): static server for the solve-UI prototype.
// Serves docs/ with node's own http module (no dependency) and prints one URL per variant.
// Usage: npm run prototype    (PORT=8765 and HOST=127.0.0.1 by default; PORT=0 picks any free port)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const host = process.env.HOST || '127.0.0.1';
const wantedPort = process.env.PORT !== undefined ? Number(process.env.PORT) : 8765;

const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.md': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(root, pathname);
    if (!file.startsWith(root)) {
        res.writeHead(403).end();
        return;
    }
    if (pathname.endsWith('/')) {
        file = path.join(file, 'index.html');
    }
    fs.readFile(file, (err, data) => {
        if (err) {
            res.writeHead(404, {'Content-Type': 'text/plain'}).end('Not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        res.end(data);
    });
});

function loadSamples() {
    const sandbox = {window: {}};
    vm.runInNewContext(fs.readFileSync(path.join(here, 'samples.js'), 'utf8'), sandbox);
    return sandbox.window.PrototypeSamples || [];
}

function listen(port) {
    server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && process.env.PORT === undefined) {
            listen(0); // default port busy: take any free one
        } else {
            throw err;
        }
    });
    server.listen(port, host, () => {
        const actual = server.address().port;
        const base = `http://${host === '0.0.0.0' ? 'localhost' : host}:${actual}/`;
        const samples = loadSamples();
        const first = samples[0];
        console.log(`PROTOTYPE solve UI: serving ${root}`);
        console.log(`Legacy page (no variant): ${base}${first ? first.hash : ''}`);
        for (const k of 'ABCDEFGHIJK') {
            console.log(`Variant ${k}: ${base}?variant=${k}${first ? first.hash : ''}`);
        }
        console.log('Sample puzzles (pick them in the switcher, or swap the #... part):');
        samples.forEach((s) => console.log(`  ${s.name}`));
        console.log('Ctrl+C to stop.');
    });
}

listen(wantedPort);
