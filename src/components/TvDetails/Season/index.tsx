import AirDateBadge from '@app/components/AirDateBadge';
import CachedImage from '@app/components/Common/CachedImage';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import defineMessages from '@app/utils/defineMessages';
import { Permission, useUser } from '@app/hooks/useUser';
import type { SeasonWithEpisodes } from '@server/models/Tv';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

interface EpisodeQuality {
  season: number;
  episode: number;
  label: string;
  sizeBytes: number;
}

const formatFileSize = (bytes: number) =>
  bytes >= 1_000_000_000
    ? `${(bytes / 1_000_000_000).toFixed(1)} GB`
    : `${Math.round(bytes / 1_000_000)} MB`;

const messages = defineMessages('components.TvDetails.Season', {
  somethingwentwrong: 'Something went wrong while retrieving season data.',
  noepisodes: 'Episode list unavailable.',
});

type SeasonProps = {
  seasonNumber: number;
  tvId: number;
  tvdbId?: number;
};

const Season = ({ seasonNumber, tvId, tvdbId }: SeasonProps) => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const { data, error } = useSWR<SeasonWithEpisodes>(
    `/api/v1/tv/${tvId}/season/${seasonNumber}`
  );

  // One request per show (SWR dedupes the shared key across seasons)
  const { data: qualityData } = useSWR<{ episodes: EpisodeQuality[] }>(
    hasPermission(Permission.ADMIN) && tvdbId
      ? `/api/v1/activity/quality?mediaType=tv&tvdbId=${tvdbId}`
      : null
  );
  const episodeQuality = new Map(
    (qualityData?.episodes ?? [])
      .filter((episode) => episode.season === seasonNumber)
      .map((episode) => [episode.episode, episode])
  );

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <div>{intl.formatMessage(messages.somethingwentwrong)}</div>;
  }

  return (
    <div className="flex flex-col justify-center divide-y divide-gray-700">
      {data.episodes.length === 0 ? (
        <p>{intl.formatMessage(messages.noepisodes)}</p>
      ) : (
        data.episodes
          .slice()
          .reverse()
          .map((episode) => {
            return (
              <div
                className="flex flex-col space-y-4 py-4 xl:flex-row xl:space-x-4 xl:space-y-4"
                key={`season-${seasonNumber}-episode-${episode.episodeNumber}`}
              >
                <div className="flex-1">
                  <div className="flex flex-col space-y-2 xl:flex-row xl:items-center xl:space-x-2 xl:space-y-0">
                    <h3 className="text-lg">
                      {episode.episodeNumber} - {episode.name}
                    </h3>
                    {episode.airDate && (
                      <AirDateBadge airDate={episode.airDate} />
                    )}
                    {episodeQuality.has(episode.episodeNumber) && (
                      <span className="rounded-full border border-gray-700 bg-gray-800 px-2.5 py-0.5 text-xs font-semibold text-indigo-400">
                        {episodeQuality.get(episode.episodeNumber)?.label} ·{' '}
                        {formatFileSize(
                          episodeQuality.get(episode.episodeNumber)
                            ?.sizeBytes ?? 0
                        )}
                      </span>
                    )}
                  </div>
                  {episode.overview && <p>{episode.overview}</p>}
                </div>
                {episode.stillPath && (
                  <div className="relative aspect-video xl:h-32">
                    <CachedImage
                      type="tmdb"
                      className="rounded-lg object-contain"
                      src={episode.stillPath}
                      alt=""
                      fill
                    />
                  </div>
                )}
              </div>
            );
          })
      )}
    </div>
  );
};

export default Season;
