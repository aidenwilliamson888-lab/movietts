function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getWorkerConfig(env) {
  const workerUrl = String(env.R2_UPLOAD_URL || "").replace(/\/+$/, "");
  const secret = String(env.R2_UPLOAD_SECRET || "");

  if (!workerUrl) {
    throw new Error("R2_UPLOAD_URL is not configured.");
  }

  if (!secret) {
    throw new Error("R2_UPLOAD_SECRET is not configured.");
  }

  return {
    workerUrl,
    secret
  };
}

async function workerFetch(env, path) {
  const { workerUrl, secret } = getWorkerConfig(env);

  return fetch(`${workerUrl}${path}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${secret}`
    }
  });
}

async function getConfig(env) {
  const response = await workerFetch(
    env,
    "/podcast-config"
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load podcast config (${response.status}).`
    );
  }

  const data = await response.json();

  return data?.config || {};
}

async function getManifest(env) {
  const response = await workerFetch(
    env,
    "/manifest"
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load podcast manifest (${response.status}).`
    );
  }

  const data = await response.json();

  return data?.manifest || {
    episodes: []
  };
}

function formatDuration(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const totalMinutes = Number(value);

  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) {
    return "";
  }

  const totalSeconds = Math.round(totalMinutes * 60);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(
    (totalSeconds % 3600) / 60
  );
  const seconds = totalSeconds % 60;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0")
  ].join(":");
}

function formatPubDate(dateValue) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return new Date().toUTCString();
  }

  return date.toUTCString();
}

function normalizeBoolean(value) {
  return value === true ||
    value === "true" ||
    value === 1 ||
    value === "1";
}

function buildEpisodeXml(episode, config) {
  const title = episode.title || episode.movie_title || "Untitled Episode";

  const description =
    episode.description ||
    episode.movie_title ||
    "";

  const audioUrl =
    episode.audio_url ||
    "";

  if (!audioUrl) {
    return "";
  }

  const guid =
    episode.guid ||
    audioUrl ||
    episode.audio_key ||
    `episode-${episode.id || Date.now()}`;

  const audioSize =
    Number(episode.audio_size || 0);

  const duration =
    formatDuration(episode.duration);

  const pubDate =
    formatPubDate(
      episode.generated_at
    );

  const poster =
    episode.poster ||
    config.artwork_url ||
    "";

  const episodeImage =
    poster
      ? `\n      <itunes:image href="${xmlEscape(poster)}" />`
      : "";

  const durationXml =
    duration
      ? `\n      <itunes:duration>${xmlEscape(duration)}</itunes:duration>`
      : "";

  const length =
    audioSize > 0
      ? audioSize
      : 0;

  return `
    <item>
      <title>${xmlEscape(title)}</title>
      <description>${xmlEscape(description)}</description>

      <guid isPermaLink="false">${xmlEscape(guid)}</guid>

      <pubDate>${xmlEscape(pubDate)}</pubDate>

      <enclosure
        url="${xmlEscape(audioUrl)}"
        length="${length}"
        type="audio/mpeg"
      />

      <itunes:episodeType>full</itunes:episodeType>${durationXml}${episodeImage}
    </item>`;
}

export async function onRequestGet(context) {
  try {
    const [config, manifest] = await Promise.all([
      getConfig(context.env),
      getManifest(context.env)
    ]);

    const episodes = Array.isArray(manifest.episodes)
      ? manifest.episodes
      : [];

    const podcastTitle =
      config.podcast_title ||
      "Movie Podcast";

    const podcastDescription =
      config.podcast_description ||
      "Movie podcast episodes.";

    const author =
      config.author ||
      "";

    const email =
      config.email ||
      "";

    const artwork =
      config.artwork_url ||
      "";

    const website =
      config.website_url ||
      new URL(context.request.url).origin;

    const category =
      config.category ||
      "TV & Film";

    const language =
      config.language ||
      "en-us";

    const explicit =
      normalizeBoolean(config.explicit)
        ? "true"
        : "false";

    const podcastType =
      config.podcast_type ||
      "episodic";

    const ownerXml =
      author || email
        ? `
      <itunes:owner>
        <itunes:name>${xmlEscape(author)}</itunes:name>
        <itunes:email>${xmlEscape(email)}</itunes:email>
      </itunes:owner>`
        : "";

    const artworkXml =
      artwork
        ? `
      <itunes:image href="${xmlEscape(artwork)}" />`
        : "";

    const categoryXml =
      category
        ? `
      <itunes:category text="${xmlEscape(category)}" />`
        : "";

    const items = episodes
      .filter(Boolean)
      .map(episode =>
        buildEpisodeXml(episode, config)
      )
      .filter(Boolean)
      .join("\n");

    const lastBuildDate =
      episodes.length > 0
        ? formatPubDate(
            episodes[0].generated_at
          )
        : new Date().toUTCString();

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">

  <channel>

    <title>${xmlEscape(podcastTitle)}</title>

    <link>${xmlEscape(website)}</link>

    <description>${xmlEscape(podcastDescription)}</description>

    <language>${xmlEscape(language)}</language>

    <lastBuildDate>${xmlEscape(lastBuildDate)}</lastBuildDate>

    <generator>Movie Podcast Generator V2.6</generator>

    <itunes:author>${xmlEscape(author)}</itunes:author>

    <itunes:summary>${xmlEscape(podcastDescription)}</itunes:summary>

    <itunes:explicit>${explicit}</itunes:explicit>

    <itunes:type>${xmlEscape(podcastType)}</itunes:type>

    ${categoryXml}

    ${artworkXml}

    ${ownerXml}

    ${items}

  </channel>

</rss>`;

    return new Response(rss, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    });

  } catch (error) {
    return new Response(
      `RSS generation error: ${error.message || "Unknown error"}`,
      {
        status: 500,
        headers: {
          "Content-Type": "text/plain; charset=utf-8"
        }
      }
    );
  }
}
