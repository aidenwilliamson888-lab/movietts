
const RSS_VERSION = "2.6.1";

const DEFAULT_ARTWORK =
  "https://movietts.pages.dev/default-podcast-artwork.jpg";

/**
 * Escape special XML characters safely.
 */
function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Escape XML attribute values.
 */
function xmlAttribute(value) {
  return xmlEscape(value);
}

/**
 * Ensure URL has no trailing slash.
 */
function cleanBaseUrl(value) {
  return String(value ?? "").replace(/\/+$/, "");
}

/**
 * Convert a value into a valid absolute URL when possible.
 */
function normalizeUrl(value, fallback = "") {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return fallback;
  }

  try {
    return new URL(raw).toString();
  } catch {
    return fallback;
  }
}

/**
 * Return a valid RFC 822 date.
 */
function formatPubDate(value) {
  if (!value) {
    return new Date().toUTCString();
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return new Date().toUTCString();
  }

  return date.toUTCString();
}

/**
 * Convert duration values into HH:MM:SS.
 *
 * Supports:
 * - HH:MM:SS
 * - MM:SS
 * - seconds
 * - minutes
 */
function formatDuration(value) {
  if (value === null || value === undefined || value === "") {
    return "00:00:00";
  }

  const raw = String(value).trim();

  if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) {
    return raw;
  }

  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    return `00:${raw}`;
  }

  const numeric = Number(raw);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "00:00:00";
  }

  // Existing manifest duration is stored in minutes.
  const totalSeconds = Math.round(numeric * 60);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":");
}

/**
 * Convert byte count into a valid enclosure length.
 */
function formatAudioLength(value) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < 0) {
    return "0";
  }

  return String(Math.round(numeric));
}

/**
 * Fetch JSON from the upload Worker.
 */
async function fetchWorkerJson(url, secret) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      `Worker request failed: ${response.status} ${text.slice(0, 300)}`
    );
  }

  return data;
}

/**
 * Extract a usable object from different Worker response formats.
 */
function unwrapData(data) {
  if (!data || typeof data !== "object") {
    return {};
  }

  if (data.data && typeof data.data === "object") {
    return data.data;
  }

  return data;
}

/**
 * Normalize podcast configuration.
 */
function normalizeConfig(raw) {
  const config = unwrapData(raw);

  return {
    title: String(
      config.title ||
        config.podcastTitle ||
        config.podcast_title ||
        "My Podcast"
    ).trim(),

    description: String(
      config.description ||
        config.podcastDescription ||
        config.podcast_description ||
        "Podcast episodes"
    ).trim(),

    author: String(
      config.author ||
        config.podcastAuthor ||
        config.podcast_author ||
        ""
    ).trim(),

    email: String(
      config.email ||
        config.podcastEmail ||
        config.podcast_email ||
        ""
    ).trim(),

    artworkUrl: String(
      config.artworkUrl ||
        config.artwork_url ||
        config.artwork ||
        DEFAULT_ARTWORK
    ).trim(),

    websiteUrl: String(
      config.websiteUrl ||
        config.website_url ||
        "https://movietts.pages.dev"
    ).trim(),

    category: String(
      config.category ||
        "TV & Film"
    ).trim(),

    language: String(
      config.language ||
        "en-us"
    ).trim(),

    explicit:
      config.explicit === true ||
      String(config.explicit).toLowerCase() === "true"
        ? "true"
        : "false",

    type: String(
      config.type ||
        config.podcastType ||
        "episodic"
    ).trim(),
  };
}

/**
 * Normalize manifest episodes.
 */
function normalizeEpisodes(raw) {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (raw && Array.isArray(raw.episodes)) {
    return raw.episodes;
  }

  if (raw && raw.data && Array.isArray(raw.data.episodes)) {
    return raw.data.episodes;
  }

  return [];
}

/**
 * Get an episode's audio URL.
 */
function getAudioUrl(episode) {
  return String(
    episode.audio_url ||
      episode.audioUrl ||
      episode.enclosure_url ||
      episode.enclosureUrl ||
      episode.url ||
      ""
  ).trim();
}

/**
 * Get an episode's unique identifier.
 */
function getEpisodeGuid(episode, audioUrl, index) {
  return String(
    episode.guid ||
      episode.id ||
      episode.audio_key ||
      episode.audioKey ||
      audioUrl ||
      `episode-${index + 1}`
  ).trim();
}

/**
 * Get episode title.
 */
function getEpisodeTitle(episode, index) {
  return String(
    episode.title ||
      episode.name ||
      `Episode ${index + 1}`
  ).trim();
}

/**
 * Get episode description.
 */
function getEpisodeDescription(episode) {
  return String(
    episode.description ||
      episode.summary ||
      episode.overview ||
      ""
  ).trim();
}

/**
 * Get episode artwork.
 */
function getEpisodeArtwork(episode, fallbackArtwork) {
  return String(
    episode.artwork_url ||
      episode.artworkUrl ||
      episode.image ||
      episode.poster ||
      fallbackArtwork ||
      ""
  ).trim();
}

/**
 * Get episode publication date.
 */
function getEpisodeDate(episode) {
  return (
    episode.pubDate ||
    episode.pub_date ||
    episode.publishedAt ||
    episode.published_at ||
    episode.createdAt ||
    episode.created_at ||
    new Date().toISOString()
  );
}

/**
 * Build one RSS item.
 */
function buildEpisodeXml(episode, index, artworkUrl) {
  const audioUrl = getAudioUrl(episode);

  if (!audioUrl) {
    return "";
  }

  const title = getEpisodeTitle(episode, index);
  const description = getEpisodeDescription(episode);
  const guid = getEpisodeGuid(episode, audioUrl, index);
  const pubDate = formatPubDate(getEpisodeDate(episode));
  const audioLength = formatAudioLength(
    episode.audio_size ||
      episode.audioSize ||
      episode.file_size ||
      episode.fileSize ||
      episode.size ||
      0
  );

  const duration = formatDuration(
    episode.duration ||
      episode.duration_minutes ||
      episode.durationMinutes ||
      episode.length_minutes ||
      episode.lengthMinutes ||
      0
  );

  const episodeArtwork = getEpisodeArtwork(
    episode,
    artworkUrl
  );

  const episodeType = String(
    episode.episode_type ||
      episode.episodeType ||
      "full"
  ).trim();

  const imageXml = episodeArtwork
    ? `
      <itunes:image href="${xmlAttribute(episodeArtwork)}" />`
    : "";

  return `
    <item>
      <title>${xmlEscape(title)}</title>

      <description>${xmlEscape(description)}</description>

      <guid isPermaLink="false">${xmlEscape(guid)}</guid>

      <pubDate>${xmlEscape(pubDate)}</pubDate>

      <enclosure
        url="${xmlAttribute(audioUrl)}"
        length="${xmlAttribute(audioLength)}"
        type="audio/mpeg"
      />

      <itunes:episodeType>${xmlEscape(episodeType)}</itunes:episodeType>

      <itunes:duration>${xmlEscape(duration)}</itunes:duration>
      ${imageXml}

    </item>`;
}

/**
 * GET /api/rss
 */
export async function onRequestGet(context) {
  try {
    const env = context.env || {};

    const workerUrl = cleanBaseUrl(
      env.R2_UPLOAD_URL || ""
    );

    const workerSecret = String(
      env.R2_UPLOAD_SECRET || ""
    ).trim();

    if (!workerUrl || !workerSecret) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Missing R2_UPLOAD_URL or R2_UPLOAD_SECRET environment variable.",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
          },
        }
      );
    }

    const [configResponse, manifestResponse] =
      await Promise.all([
        fetchWorkerJson(
          `${workerUrl}/podcast-config`,
          workerSecret
        ),

        fetchWorkerJson(
          `${workerUrl}/manifest`,
          workerSecret
        ),
      ]);

    const config = normalizeConfig(configResponse);
    const episodes = normalizeEpisodes(manifestResponse);

    const requestUrl = new URL(context.request.url);

    const selfUrl = `${requestUrl.origin}/api/rss`;

    const artworkUrl = normalizeUrl(
      config.artworkUrl,
      DEFAULT_ARTWORK
    );

    const websiteUrl = normalizeUrl(
      config.websiteUrl,
      requestUrl.origin
    );

    const author = config.author;
    const email = config.email;

    /**
     * Important:
     * Keep email inside itunes:owner.
     * Do not add a standalone itunes:email at channel level.
     */
    const ownerXml =
      author || email
        ? `
    <itunes:owner>
      <itunes:name>${xmlEscape(author)}</itunes:name>
      <itunes:email>${xmlEscape(email)}</itunes:email>
    </itunes:owner>`
        : "";

    const channelImageXml = artworkUrl
      ? `
    <itunes:image href="${xmlAttribute(artworkUrl)}" />`
      : "";

    const standardImageXml = artworkUrl
      ? `
    <image>
      <url>${xmlEscape(artworkUrl)}</url>
      <title>${xmlEscape(config.title)}</title>
      <link>${xmlEscape(websiteUrl)}</link>
    </image>`
      : "";

    const categoryXml = config.category
      ? `
    <itunes:category text="${xmlAttribute(config.category)}" />`
      : "";

    const episodeXml = episodes
      .map((episode, index) =>
        buildEpisodeXml(
          episode,
          index,
          artworkUrl
        )
      )
      .filter(Boolean)
      .join("\n");

    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss
  version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom"
>
  <channel>

    <title>${xmlEscape(config.title)}</title>

    <link>${xmlEscape(websiteUrl)}</link>

    <description>${xmlEscape(config.description)}</description>

    <language>${xmlEscape(config.language)}</language>

    <lastBuildDate>${xmlEscape(
      new Date().toUTCString()
    )}</lastBuildDate>

    <generator>Movie Podcast Generator V${RSS_VERSION}</generator>

    <atom:link
      href="${xmlAttribute(selfUrl)}"
      rel="self"
      type="application/rss+xml"
    />

    <itunes:author>${xmlEscape(author)}</itunes:author>

    <itunes:summary>${xmlEscape(
      config.description
    )}</itunes:summary>

    <itunes:explicit>${xmlEscape(
      config.explicit
    )}</itunes:explicit>

    <itunes:type>${xmlEscape(
      config.type
    )}</itunes:type>

    ${categoryXml}

    ${channelImageXml}

    ${ownerXml}

    ${standardImageXml}

    ${episodeXml}

  </channel>
</rss>`;

    return new Response(rssXml, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
        "Cache-Control":
          "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("RSS generation error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Failed to generate RSS feed.",
        message: error.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
