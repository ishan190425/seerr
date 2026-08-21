import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import defineMessages from '@app/utils/defineMessages';
import type { YtCandidate, YtJob } from '@server/routes/activity';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.MovieDetails.YoutubeRescue', {
  findonyoutube: 'Find on YouTube',
  foundonyoutube: 'Found on YouTube',
  runtimematches: '✓ runtime matches ({runtime})',
  runtimeshort: 'runtime shorter than expected — likely cut',
  runtimeunknown: 'runtime unknown',
  download: 'Download & add to library',
  downloading: 'Downloading… {progress}%',
  importing: 'Importing into Radarr…',
  done: 'Done — importing into the library',
  failed: 'Download failed',
  nocandidates: 'Nothing usable found on YouTube.',
});

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:00` : `${minutes} min`;
};

type YoutubeRescueProps = {
  tmdbId: number;
  title: string;
  year?: string;
  runtime?: number;
};

const YoutubeRescue = ({ tmdbId, title, year, runtime }: YoutubeRescueProps) => {
  const intl = useIntl();
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<YtCandidate[]>([]);
  const [activeJobs, setActiveJobs] = useState<Set<string>>(new Set());

  const { data: jobData } = useSWR<{ jobs: YtJob[] }>(
    activeJobs.size > 0 ? '/api/v1/activity/ytjobs' : null,
    { refreshInterval: 3000 }
  );

  const search = async () => {
    setSearching(true);
    try {
      const query = encodeURIComponent(
        `${title} ${year ?? ''} full movie`.trim()
      );
      const response = await axios.get<{ candidates: YtCandidate[] }>(
        `/api/v1/activity/ytsearch?query=${query}`
      );
      setCandidates(
        response.data.candidates.filter((c) => c.duration >= 45 * 60)
      );
      setSearched(true);
    } finally {
      setSearching(false);
    }
  };

  const startDownload = async (candidate: YtCandidate) => {
    await axios.post('/api/v1/activity/ytdownload', {
      videoId: candidate.videoId,
      tmdbId,
    });
    setActiveJobs((jobs) => new Set(jobs).add(candidate.videoId));
  };

  const runtimeBadge = (candidate: YtCandidate) => {
    if (!runtime) {
      return null;
    }
    const diffMinutes = candidate.duration / 60 - runtime;
    if (Math.abs(diffMinutes) <= 12) {
      return (
        <span className="text-xs text-green-400">
          {intl.formatMessage(messages.runtimematches, {
            runtime: `${Math.floor(runtime / 60)}h ${runtime % 60}m`,
          })}
        </span>
      );
    }
    if (diffMinutes < -15) {
      return (
        <span className="text-xs text-yellow-400">
          {intl.formatMessage(messages.runtimeshort)}
        </span>
      );
    }
    return null;
  };

  const jobFor = (videoId: string) =>
    jobData?.jobs.find((job) => job.id === videoId);

  if (!searched) {
    return (
      <div className="mt-4">
        <Button buttonType="default" onClick={() => search()} disabled={searching}>
          <svg width="15" height="15" viewBox="0 0 18 18" fill="none">
            <path d="M4 2 L14 9 L4 16 Z" fill="currentColor" />
          </svg>
          <span>
            {searching
              ? intl.formatMessage(messages.downloading, { progress: '' })
              : intl.formatMessage(messages.findonyoutube)}
          </span>
        </Button>
        {searching && <LoadingSpinner />}
      </div>
    );
  }

  return (
    <div className="mt-4 max-w-3xl rounded-xl border border-gray-700 bg-gray-800 p-5">
      <div className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-100">
        {intl.formatMessage(messages.foundonyoutube)}
      </div>
      {candidates.length === 0 ? (
        <div className="text-sm text-gray-400">
          {intl.formatMessage(messages.nocandidates)}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {candidates.slice(0, 4).map((candidate) => {
            const job = jobFor(candidate.videoId);
            return (
              <div
                key={candidate.videoId}
                className="flex items-center gap-4 rounded-lg border border-gray-700 bg-gray-900 p-3"
              >
                <div className="flex min-w-0 flex-grow flex-col gap-1">
                  <div className="truncate text-sm font-semibold text-gray-100">
                    {candidate.title}
                  </div>
                  <div className="text-xs text-gray-400">
                    {candidate.channel} · {formatDuration(candidate.duration)}
                  </div>
                  {runtimeBadge(candidate)}
                  {job && job.state === 'downloading' && (
                    <div className="mt-1 flex items-center gap-3">
                      <div className="h-1.5 w-56 rounded-full bg-gray-700">
                        <div
                          className="h-1.5 rounded-full bg-indigo-600"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">
                        {intl.formatMessage(messages.downloading, {
                          progress: Math.round(job.progress),
                        })}
                      </span>
                    </div>
                  )}
                  {job && job.state === 'importing' && (
                    <span className="text-xs text-indigo-400">
                      {intl.formatMessage(messages.importing)}
                    </span>
                  )}
                  {job && job.state === 'done' && (
                    <span className="text-xs text-green-400">
                      {intl.formatMessage(messages.done)}
                    </span>
                  )}
                  {job && job.state === 'failed' && (
                    <span className="text-xs text-red-400">
                      {intl.formatMessage(messages.failed)}
                    </span>
                  )}
                </div>
                {!job && (
                  <Button
                    buttonType="primary"
                    onClick={() => startDownload(candidate)}
                  >
                    <span>{intl.formatMessage(messages.download)}</span>
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default YoutubeRescue;
