import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';
import http from 'http';
import https from 'https';

const watchRoutes = Router();

// Only the Plex paths needed for HLS playback may be proxied
const ALLOWED_PREFIXES = [
  'video/:/transcode/universal/',
  'library/parts/',
];

// Proxy streaming requests to the Plex server, attaching the requesting
// user's Plex token server-side so it never reaches the browser.
watchRoutes.get(/^\/plex\/(.*)$/, async (req, res) => {
  const plexPath = req.params[0] ?? '';

  if (!ALLOWED_PREFIXES.some((prefix) => plexPath.startsWith(prefix))) {
    return res.status(403).json({ error: 'Path not allowed' });
  }

  let token = req.user?.plexToken;
  if (!token) {
    const userRepository = getRepository(User);
    const owner = await userRepository.findOne({
      select: { id: true, plexToken: true },
      where: { id: 1 },
    });
    token = owner?.plexToken ?? undefined;
  }
  if (!token) {
    return res.status(500).json({ error: 'No Plex token available' });
  }

  const settings = getSettings();
  const { ip, port, useSsl } = settings.plex;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === 'string') {
      query.set(key, value);
    }
  }
  query.set('X-Plex-Token', token);

  const requestor = useSsl ? https : http;
  const proxyReq = requestor.request(
    {
      hostname: ip,
      port,
      path: `/${encodeURI(plexPath)}?${query.toString()}`,
      method: 'GET',
      headers: {
        ...(req.headers.range ? { range: req.headers.range } : {}),
        accept: '*/*',
      },
    },
    (proxyRes) => {
      res.status(proxyRes.statusCode ?? 500);
      for (const header of [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
      ]) {
        const value = proxyRes.headers[header];
        if (value) {
          res.setHeader(header, value);
        }
      }
      proxyRes.pipe(res);
    }
  );

  proxyReq.on('error', (e) => {
    logger.error('Plex stream proxy error', {
      label: 'Watch',
      errorMessage: e.message,
    });
    if (!res.headersSent) {
      res.status(502).json({ error: 'Plex unreachable' });
    } else {
      res.end();
    }
  });

  // Client hung up (seek, close) — stop pulling from Plex
  res.on('close', () => {
    proxyReq.destroy();
  });

  proxyReq.end();
});

export default watchRoutes;
