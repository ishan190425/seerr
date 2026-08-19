import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import Slider from '@app/components/Slider';
import TmdbTitleCard from '@app/components/TitleCard/TmdbTitleCard';
import { Permission, useUser } from '@app/hooks/useUser';
import Error from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type { MediaResultsResponse } from '@server/interfaces/api/mediaInterfaces';
import type {
  ActivityDownload,
  ActivitySession,
} from '@server/routes/activity';
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

  const { data: recentMedia } = useSWR<MediaResultsResponse>(
    '/api/v1/media?filter=allavailable&take=20&sort=mediaAdded',
    { revalidateOnMount: true }
  );

  const { data: downloadData } = useSWR<{ downloads: ActivityDownload[] }>(
    '/api/v1/activity/downloads',
    { refreshInterval: 15000 }
  );

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
                className="flex w-full max-w-md flex-col gap-2 rounded-xl border border-gray-700 bg-gradient-to-br from-indigo-950 via-gray-800 to-gray-900 p-5"
              >
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
        isLoading={!recentMedia}
        items={(recentMedia?.results ?? []).map((item) => (
          <TmdbTitleCard
            key={`activity-recent-${item.id}`}
            id={item.id}
            tmdbId={item.tmdbId}
            tvdbId={item.tvdbId}
            type={item.mediaType}
          />
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
        <div className="mb-6 flex flex-col gap-3">
          {downloadData.downloads.map((download, index) => (
            <div
              key={`download-${index}`}
              className="flex flex-col gap-2 rounded-xl border border-gray-700 bg-gray-800 p-4"
            >
              <div className="truncate text-sm font-semibold text-gray-100">
                {download.name}
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-700">
                <div
                  className="h-1.5 rounded-full bg-indigo-600"
                  style={{ width: `${download.progress}%` }}
                />
              </div>
              <div className="text-xs text-gray-400">
                {download.progress}% · {formatSpeed(download.speed)}
                {download.eta > 0 && <> · {formatEta(download.eta)}</>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default Activity;
