import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import Slider from '@app/components/Slider';
import { Permission, useUser } from '@app/hooks/useUser';
import Error from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type {
  ActivityArrival,
  ActivityDownload,
  ActivityHistoryItem,
  ActivitySession,
} from '@server/routes/activity';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Activity', {
  activity: 'Activity',
  nowshowing: 'Now Showing',
  screenslive: '{count, plural, one {# screen live} other {# screens live}}',
  noscreens: 'Nothing playing right now',
  freshartivals: 'Fresh Arrivals',
  pipeline: 'In the Pipeline',
  pipelineempty: 'Nothing downloading right now',
  minutesleft: '{minutes} min left',
  paused: 'PAUSED',
  recentlywatched: 'Recently Watched',
  allusers: 'ALL',
  episodecount: '{count, plural, one {# EP} other {# EPS}}',
});

const formatProgress = (session: ActivitySession) => {
  if (!session.duration) {
    return 0;
  }
  return Math.min(100, (session.viewOffset / session.duration) * 100);
};

const minutesLeft = (session: ActivitySession) =>
  Math.max(0, Math.round((session.duration - session.viewOffset) / 60000));

const formatSpeed = (bytesPerSecond: number) =>
  bytesPerSecond >= 1_000_000
    ? `${(bytesPerSecond / 1_000_000).toFixed(1)} MB/s`
    : `${Math.round(bytesPerSecond / 1000)} kB/s`;

const formatAddedAt = (addedAt: number) => {
  const added = new Date(addedAt * 1000);
  const today = new Date();
  const days = Math.floor(
    (today.setHours(0, 0, 0, 0) - new Date(added).setHours(0, 0, 0, 0)) /
      86400000
  );
  if (days <= 0) return 'TODAY';
  if (days === 1) return 'YESTERDAY';
  return added
    .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    .toUpperCase();
};

interface HistoryGroup {
  title: string;
  kind: string;
  thumb?: string;
  count: number;
  users: string[];
  latest?: string;
  lastViewedAt: number;
}

const historyUsers = (history: ActivityHistoryItem[]): string[] =>
  [...new Set(history.map((item) => item.user))].sort();

const groupHistory = (
  history: ActivityHistoryItem[],
  user: string | null
): HistoryGroup[] => {
  const groups = new Map<string, HistoryGroup>();
  for (const item of history) {
    if (user && item.user !== user) {
      continue;
    }
    const existing = groups.get(item.title);
    if (existing) {
      existing.count += 1;
      if (!existing.users.includes(item.user)) {
        existing.users.push(item.user);
      }
    } else {
      groups.set(item.title, {
        title: item.title,
        kind: item.kind,
        thumb: item.thumb,
        count: 1,
        users: [item.user],
        latest: item.subtitle,
        lastViewedAt: item.viewedAt,
      });
    }
  }
  return [...groups.values()];
};

const formatWatchedAt = (viewedAt: number) => {
  const diffMs = Date.now() - viewedAt * 1000;
  const hours = Math.floor(diffMs / 3600000);
  if (hours < 1) return `${Math.max(1, Math.floor(diffMs / 60000))} min ago`;
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
};

const formatEta = (seconds: number) =>
  seconds >= 3600
    ? `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m left`
    : `${Math.max(1, Math.round(seconds / 60))} min left`;

const Activity = () => {
  const intl = useIntl();
  const { hasPermission } = useUser();

  const { data: sessionData } = useSWR<{ sessions: ActivitySession[] }>(
    '/api/v1/activity/sessions',
    { refreshInterval: 10000 }
  );

  const { data: arrivalData } = useSWR<{ arrivals: ActivityArrival[] }>(
    '/api/v1/activity/arrivals',
    { refreshInterval: 60000 }
  );

  const { data: downloadData } = useSWR<{ downloads: ActivityDownload[] }>(
    '/api/v1/activity/downloads',
    { refreshInterval: 15000 }
  );

  const { data: historyData } = useSWR<{ history: ActivityHistoryItem[] }>(
    '/api/v1/activity/history',
    { refreshInterval: 60000 }
  );
  const [historyUser, setHistoryUser] = useState<string | null>(null);

  if (!hasPermission(Permission.ADMIN)) {
    return <Error statusCode={403} />;
  }

  const sessions = sessionData?.sessions ?? [];

  return (
    <>
      <PageTitle title={intl.formatMessage(messages.activity)} />

      <div className="mb-4 mt-2 flex items-center gap-3">
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            sessions.length > 0 ? 'bg-indigo-600' : 'bg-gray-600'
          }`}
        />
        <h2 className="text-sm font-bold uppercase tracking-widest text-gray-100">
          {intl.formatMessage(messages.nowshowing)}
        </h2>
        <span className="text-sm text-gray-400">
          {sessions.length > 0
            ? intl.formatMessage(messages.screenslive, {
                count: sessions.length,
              })
            : intl.formatMessage(messages.noscreens)}
        </span>
      </div>

      {!sessionData ? (
        <LoadingSpinner />
      ) : (
        sessions.length > 0 && (
          <div className="mb-8 flex flex-wrap gap-4">
            {sessions.map((session, index) => (
              <div
                key={`session-${index}`}
                className="flex w-full max-w-md gap-4 rounded-xl border border-gray-700 bg-gradient-to-br from-indigo-950 via-gray-800 to-gray-900 p-5"
              >
                <div className="h-28 w-[75px] flex-shrink-0 overflow-hidden rounded-md bg-gray-700">
                  {session.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/v1/activity/image?path=${encodeURIComponent(
                        session.thumb
                      )}`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="flex min-w-0 flex-grow flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="truncate text-lg font-extrabold text-gray-100">
                    {session.title}
                  </div>
                  {session.state === 'paused' && (
                    <span className="text-xs font-bold tracking-widest text-gray-400">
                      {intl.formatMessage(messages.paused)}
                    </span>
                  )}
                </div>
                {session.subtitle && (
                  <div className="truncate text-sm text-gray-300">
                    {session.subtitle}
                  </div>
                )}
                <div className="text-sm text-gray-400">
                  {session.user} · {session.player}
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-700">
                  <div
                    className="h-1.5 rounded-full bg-indigo-600"
                    style={{ width: `${formatProgress(session)}%` }}
                  />
                </div>
                <div className="text-xs text-gray-400">
                  {intl.formatMessage(messages.minutesleft, {
                    minutes: minutesLeft(session),
                  })}
                </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <div className="slider-header">
        <div className="slider-title">
          <span>{intl.formatMessage(messages.freshartivals)}</span>
        </div>
      </div>
      <Slider
        sliderKey="activity-recent"
        isLoading={!arrivalData}
        items={(arrivalData?.arrivals ?? []).map((item, index) => (
          <div
            key={`arrival-${index}`}
            className="flex w-36 flex-col gap-1.5"
          >
            <div className="relative aspect-[2/3] w-36 overflow-hidden rounded-lg border border-gray-700 bg-gray-800">
              {item.thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/v1/activity/image?path=${encodeURIComponent(
                    item.thumb
                  )}`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
              <div className="absolute left-1.5 top-1.5 rounded-full bg-gray-900/85 px-2 py-0.5 text-[10px] font-bold tracking-wider text-indigo-400">
                {formatAddedAt(item.addedAt)}
              </div>
            </div>
            <div className="truncate text-sm font-semibold text-gray-100">
              {item.title}
            </div>
            {item.subtitle && (
              <div className="truncate text-xs text-gray-400">
                {item.subtitle}
              </div>
            )}
          </div>
        ))}
      />

      <div className="slider-header mt-6">
        <div className="slider-title">
          <span>{intl.formatMessage(messages.pipeline)}</span>
        </div>
      </div>
      {!downloadData ? (
        <LoadingSpinner />
      ) : downloadData.downloads.length === 0 ? (
        <div className="mb-6 text-sm text-gray-400">
          {intl.formatMessage(messages.pipelineempty)}
        </div>
      ) : (
        <div className="mb-6 flex flex-wrap gap-4">
          {downloadData.downloads.map((download, index) => (
            <div
              key={`download-${index}`}
              className="flex w-36 flex-col gap-1.5"
            >
              <div className="relative aspect-[2/3] w-36 overflow-hidden rounded-lg border border-gray-700 bg-gray-800">
                {download.posterUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={download.posterUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
                <div className="absolute left-1.5 top-1.5 rounded-full bg-gray-900/85 px-2 py-0.5 text-[10px] font-bold tracking-wider text-indigo-400">
                  {Math.round(download.progress)}%
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gray-900/70">
                  <div
                    className="h-1.5 bg-indigo-600"
                    style={{ width: `${download.progress}%` }}
                  />
                </div>
              </div>
              <div className="truncate text-sm font-semibold text-gray-100">
                {download.title}
              </div>
              <div className="truncate text-xs text-gray-400">
                {download.subtitle ? `${download.subtitle} · ` : ''}
                {formatSpeed(download.speed)}
                {download.eta > 0 ? ` · ${formatEta(download.eta)}` : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="slider-header mt-6">
        <div className="slider-title">
          <span>{intl.formatMessage(messages.recentlywatched)}</span>
        </div>
      </div>
      {!historyData ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => setHistoryUser(null)}
              className={`rounded-full px-4 py-1.5 text-[11px] font-bold tracking-widest transition ${
                historyUser === null
                  ? 'bg-indigo-600 text-white'
                  : 'border border-gray-700 text-gray-400 hover:text-gray-200'
              }`}
            >
              {intl.formatMessage(messages.allusers)}
            </button>
            {historyUsers(historyData.history).map((user) => (
              <button
                key={`history-user-${user}`}
                onClick={() => setHistoryUser(user)}
                className={`rounded-full px-4 py-1.5 text-[11px] font-bold tracking-widest transition ${
                  historyUser === user
                    ? 'bg-indigo-600 text-white'
                    : 'border border-gray-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                {user.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="mb-8 flex flex-wrap gap-4">
            {groupHistory(historyData.history, historyUser).map(
              (group, index) => (
                <div
                  key={`history-group-${index}`}
                  className="flex w-36 flex-col gap-1.5"
                >
                  <div className="relative aspect-[2/3] w-36 overflow-hidden rounded-lg border border-gray-700 bg-gray-800">
                    {group.thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/v1/activity/image?path=${encodeURIComponent(
                          group.thumb
                        )}`}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )}
                    {group.kind === 'episode' && (
                      <div className="absolute left-1.5 top-1.5 rounded-full bg-gray-900/85 px-2 py-0.5 text-[10px] font-bold tracking-wider text-indigo-400">
                        {intl.formatMessage(messages.episodecount, {
                          count: group.count,
                        })}
                      </div>
                    )}
                    <div className="absolute bottom-1.5 left-1.5 rounded-full bg-gray-900/85 px-2 py-0.5 text-[10px] font-bold tracking-wider text-gray-300">
                      {formatWatchedAt(group.lastViewedAt)}
                    </div>
                  </div>
                  <div className="truncate text-sm font-semibold text-gray-100">
                    {group.title}
                  </div>
                  <div className="truncate text-xs text-gray-400">
                    {historyUser === null
                      ? group.users.join(' · ')
                      : group.latest}
                  </div>
                </div>
              )
            )}
          </div>
        </>
      )}
    </>
  );
};

export default Activity;
