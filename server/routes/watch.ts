import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import type { Request, Response } from 'express';
import { Router } from 'express';
import http from 'http';
import https from 'https';

const watchRoutes = Router();

// Only the Plex paths needed for playback may be proxied
const ALLOWED_GET_PREFIXES = [
  'video/:/transcode/universal/',
  'library/parts/',
  'library/metadata/',
];
// PUT is only for audio/subtitle stream selection on a part
const ALLOWED_PUT_PATTERN = /^library\/parts\/\d+$/;

// plexToken is a select:false column, so it is never present on req.user
// and must be fetched explicitly
const getUserPlexToken = async (
  userId: number | undefined
): Promise<string | null> => {
  if (!userId) {
    return null;
  }
  const userRepository = getRepository(User);
  const found = await userRepository.findOne({
    select: { id: true, plexToken: true },
    where: { id: userId },
  });
  return found?.plexToken ?? null;
};

const resolveToken = async (req: Request): Promise<string | undefined> => {
  const userToken = await getUserPlexToken(req.user?.id);
  if (userToken) {
    return userToken;
  }
  return (await getUserPlexToken(1)) ?? undefined;
};

interface PlexConnection {
  uri: string;
  local: boolean;
}

let cachedConnections: PlexConnection[] | null = null;
let cachedConnectionsAt = 0;
const CONNECTION_CACHE_TTL = 10 * 60 * 1000;

// Direct-play info: plex.direct connection URIs for this server plus the
// requesting user's own Plex token. Users without a Plex token of their own
// get no token and fall back to the server-side proxy — the owner's token is
// never sent to a browser.
watchRoutes.get('/streaminfo', async (req, res) => {
  const settings = getSettings();
  const userToken = await getUserPlexToken(req.user?.id);

  let connections: PlexConnection[] = [];
  try {
    if (
      cachedConnections &&
      Date.now() - cachedConnectionsAt < CONNECTION_CACHE_TTL
    ) {
      connections = cachedConnections;
    } else {
      const ownerToken = await resolveToken(req);
      if (ownerToken) {
        const response = await fetch(
          `https://plex.tv/api/v2/resources?includeHttps=1&X-Plex-Token=${ownerToken}&X-Plex-Client-Identifier=rathi-studios-web`,
          { headers: { accept: 'application/json' } }
        );
        if (response.ok) {
          const resources = (await response.json()) as {
            provides: string;
            clientIdentifier: string;
            connections: (PlexConnection & { relay?: boolean })[];
          }[];
          const server = resources.find(
            (r) =>
              r.provides.includes('server') &&
              r.clientIdentifier === settings.plex.machineId
          );
          connections = (server?.connections ?? [])
            .filter((c) => !c.relay)
            // Docker bridge addresses are unreachable from any browser
            .filter((c) => !/^https:\/\/172-(1[6-9]|2\d|3[01])-/.test(c.uri))
            .map((c) => ({ uri: c.uri, local: c.local }));
          cachedConnections = connections;
          cachedConnectionsAt = Date.now();
        }
      }
    }
  } catch (e) {
    logger.warn('Failed to fetch plex.tv resources for direct streaming', {
      label: 'Watch',
      errorMessage: (e as Error).message,
    });
  }

  return res.status(200).json({
    token: userToken,
    connections: userToken ? connections : [],
  });
});

const proxyToPlex = (
  req: Request,
  res: Response,
  plexPath: string,
  token: string,
  method: 'GET' | 'PUT'
) => {
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
      method,
      headers: {
        ...(req.headers.range ? { range: req.headers.range } : {}),
        accept:
          typeof req.headers.accept === 'string' ? req.headers.accept : '*/*',
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
};

// Proxy streaming/metadata requests to the Plex server, attaching the
// requesting user's Plex token server-side so it never reaches the browser.
watchRoutes.get(/^\/plex\/(.*)$/, async (req, res) => {
  const plexPath = req.params[0] ?? '';

  if (!ALLOWED_GET_PREFIXES.some((prefix) => plexPath.startsWith(prefix))) {
    return res.status(403).json({ error: 'Path not allowed' });
  }

  const token = await resolveToken(req);
  if (!token) {
    return res.status(500).json({ error: 'No Plex token available' });
  }

  return proxyToPlex(req, res, plexPath, token, 'GET');
});

// Audio/subtitle stream selection
watchRoutes.put(/^\/plex\/(.*)$/, async (req, res) => {
  const plexPath = req.params[0] ?? '';

  if (!ALLOWED_PUT_PATTERN.test(plexPath)) {
    return res.status(403).json({ error: 'Path not allowed' });
  }

  const token = await resolveToken(req);
  if (!token) {
    return res.status(500).json({ error: 'No Plex token available' });
  }

  return proxyToPlex(req, res, plexPath, token, 'PUT');
});

export default watchRoutes;
