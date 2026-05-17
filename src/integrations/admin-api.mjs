// Custom Astro integration: registers a Vite dev-server middleware that
// exposes admin save endpoints under /api/admin/*. The middleware is only
// installed during `astro dev` (astro:server:setup hook), so production
// builds never see these routes — the /admin pages are still rendered as
// static HTML but the Save button has no working endpoint there.
//
// Endpoint:
//   POST /api/admin/save-lesson
//   Body: { id: "YYYY-MM-DD-slug", data: <full lesson object> }
//   Writes src/content/lessons/<id>.json with formatted JSON.

import { writeFile, mkdir, readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const LESSONS_DIR = join(ROOT, 'src/content/lessons');

const LESSON_ID_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;
const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function respond(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function readJsonBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(new Error(`Invalid JSON body: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

/** Light, dev-only structural check. Astro's Zod runs on the next build
 *  anyway, so this is just to catch obvious mistakes early and not write
 *  garbage to disk. */
function validateLessonData(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'data must be an object';
  if (typeof d.id !== 'string' || !LESSON_ID_RE.test(d.id)) return 'data.id missing or malformed';
  if (typeof d.date_assigned !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date_assigned)) {
    return 'data.date_assigned must be YYYY-MM-DD';
  }
  if (typeof d.title_en !== 'string' || !d.title_en.trim()) return 'data.title_en required';
  if (typeof d.title_pl !== 'string' || !d.title_pl.trim()) return 'data.title_pl required';
  if (typeof d.image !== 'string' || !d.image.trim()) return 'data.image required';
  if (!d.levels || typeof d.levels !== 'object') return 'data.levels must be an object';
  return null;
}

async function handleSaveLesson(req, res) {
  if (req.method !== 'POST') return respond(res, 405, { error: 'Method not allowed' });
  const body = await readJsonBody(req);
  if (!body || typeof body !== 'object') return respond(res, 400, { error: 'Missing body' });
  const { id, data } = body;
  if (typeof id !== 'string' || !LESSON_ID_RE.test(id)) {
    return respond(res, 400, { error: 'Invalid id (expected YYYY-MM-DD-slug)' });
  }
  if (data && data.id && data.id !== id) {
    return respond(res, 400, { error: 'data.id does not match url id' });
  }
  const err = validateLessonData({ ...data, id });
  if (err) return respond(res, 400, { error: err });

  const path = join(LESSONS_DIR, `${id}.json`);
  await mkdir(LESSONS_DIR, { recursive: true });

  // Preserve key order: id, date_assigned, ... by relying on the client to
  // send the fully-merged object. Format with 2-space indent + trailing LF
  // to match what the rest of the repo uses.
  const payload = { id, ...stripUndefined(data) };
  const formatted = JSON.stringify(payload, null, 2) + '\n';
  await writeFile(path, formatted, 'utf8');

  return respond(res, 200, {
    ok: true,
    path: `src/content/lessons/${id}.json`,
    bytes: Buffer.byteLength(formatted, 'utf8'),
  });
}

function stripUndefined(obj) {
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out;
  }
  return obj;
}

export default function adminApi() {
  return {
    name: 'admin-api',
    hooks: {
      'astro:server:setup': ({ server, logger }) => {
        logger.info('admin-api middleware mounted at /api/admin/* (dev only)');

        server.middlewares.use('/api/admin/save-lesson', async (req, res, next) => {
          try {
            await handleSaveLesson(req, res);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('[admin-api] save-lesson failed:', err);
            respond(res, 500, { error: err.message || 'Internal error' });
          }
        });
      },
    },
  };
}
