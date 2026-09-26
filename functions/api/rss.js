const RSS_VERSION = "2.9";

const DEFAULT_ARTWORK =
  "https://movietts.pages.dev/default-podcast-artwork.jpg";

/* =========================
   XML HELPERS
========================= */

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/*
 * Description sengaja TIDAK di-escape.
 * Tujuannya supaya HTML seperti:
 *
 * <p><a href="...">👉🎬 Xem Movie</a></p>
 *
 * tetap tampil sebagai HTML di RSS.
 */
function rssDescription(value) {
  let text = String(value ?? "");

  /*
   * Escape hanya "&" yang bukan bagian dari
   * entity HTML/XML yang sudah valid.
   */
  text = text.replace(
    /&(?!amp;|lt;|gt;|quot;|apos;|nbsp;|#\d+;|#x[0-9a-fA-F]+;)/g,
    "&amp;"
  );

  return text;
}

function xmlAttribute(value) {
  return xmlEscape(value);
}

/* =========================
   URL
========================= */

function cleanBaseUrl(value) {
  return String(value ?? "").replace(/\/+$/, "");
}

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

/* =========================
   DATE
========================= */

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

/* =========================
   DURATION
========================= */

function formatDuration(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  const raw = String(value).trim();

  /*
   * HH:MM:SS
   */
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(raw)) {
    return raw;
  }

  /*
   * MM:SS
   */
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    return `00:${raw}`;
  }

  const numeric = Number(raw);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "";
  }

  /*
   * Manifest menyimpan duration dalam menit.
   */
  const totalSeconds = Math.round(numeric * 60);

  const hours = Math.floor(totalSeconds / 3600);

  const minutes = Math.floor(
    (totalSeconds % 3600) / 60
  );

  const seconds = totalSeconds % 60;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(seconds).padStart(2, "0"),
  ].join(":");
}

/* =========================
   AUDIO SIZE
========================= */

function formatAudioLength(value) {
  const numeric = Number(value);

  if (
    !Number.isFinite(numeric) ||
    numeric < 0
  ) {
    return "0";
  }

  return String(Math.round(numeric));
}

/* =========================
   WORKER
========================= */

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
      `Worker request failed: ${response.status} ${text.slice(
        0,
        300
      )}`
    );
  }

  return data;
}

/* =========================
   UNWRAP
========================= */

function unwrapData(data) {
  if (!data || typeof data !== "object") {
    return {};
  }

  if (
    data.data &&
    typeof data.data === "object"
  ) {
    return data.data;
  }

  return data;
}

/* =========================
   PODCAST CONFIG
========================= */

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
      String(config.explicit).toLowerCase() ===
        "true"
        ? "true"
        : "false",

    type: String(
      config.type ||
        config.podcastType ||
        "episodic"
    ).trim(),
  };
}

/* =========================
   EPISODES
========================= */

function normalizeEpisodes(raw) {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (
    raw &&
    Array.isArray(raw.episodes)
  ) {
    return raw.episodes;
  }

  if (
    raw &&
    raw.data &&
    Array.isArray(raw.data.episodes)
  ) {
    return raw.data.episodes;
  }

  return [];
}

/* =========================
   EPISODE DATA
========================= */

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

function getEpisodeGuid(
  episode,
  audioUrl,
  index
) {
  return String(
    episode.guid ||
      episode.audio_key ||
      episode.audioKey ||
      audioUrl ||
      `episode-${index + 1}`
  ).trim();
}

function getEpisodeTitle(
  episode,
  index
) {
  return String(
    episode.title ||
      episode.name ||
      `Episode ${index + 1}`
  ).trim();
}

function getEpisodeDescription(episode) {
  /*
   * PRIORITAS UTAMA:
   * description yang sudah dibuat generator.
   *
   * Jangan dibuat ulang.
   */
  return String(
    episode.description ||
      episode.summary ||
      episode.overview ||
      ""
  ).trim();
}

function getEpisodeArtwork(
  episode,
  fallbackArtwork
) {
  return String(
    episode.artwork_url ||
      episode.artworkUrl ||
      episode.image ||
      episode.poster ||
      fallbackArtwork ||
      ""
  ).trim();
}

function getEpisodeDate(episode) {
  return (
    episode.pubDate ||
    episode.pub_date ||
    episode.publishedAt ||
    episode.published_at ||
    episode.generated_at ||
    episode.generatedAt ||
    episode.createdAt ||
    episode.created_at ||
    new Date().toISOString()
  );
}

/*
 * Ambil TMDB Movie ID.
 *
 * Jangan menggunakan episode.id sebagai fallback
 * karena id tersebut belum tentu TMDB ID.
 */
function getMovieId(episode) {
  return String(
    episode.movie_id ||
      episode.movieId ||
      episode.tmdb_id ||
      episode.tmdbId ||
      episode.tmdbID ||
      ""
  ).trim();
}

/* =========================
   BUILD ITEM
========================= */

function buildEpisodeXml(
  episode,
  index,
  artworkUrl
) {
  const audioUrl = getAudioUrl(episode);

  if (!audioUrl) {
    return "";
  }

  const title =
    getEpisodeTitle(
      episode,
      index
    );

  const description =
    getEpisodeDescription(
      episode
    );

  const guid =
    getEpisodeGuid(
      episode,
      audioUrl,
      index
    );

  const pubDate =
    formatPubDate(
      getEpisodeDate(episode)
    );

  const audioLength =
    formatAudioLength(
      episode.audio_size ||
        episode.audioSize ||
        episode.file_size ||
        episode.fileSize ||
        episode.size ||
        0
    );

  const duration =
    formatDuration(
      episode.duration ||
        episode.duration_minutes ||
        episode.durationMinutes ||
        episode.length_minutes ||
        episode.lengthMinutes ||
        ""
    );

  const episodeArtwork =
    getEpisodeArtwork(
      episode,
      artworkUrl
    );

  const movieId =
    getMovieId(episode);

  /*
   * Duration:
   *
   * Kalau kosong:
   * <itunes:duration/>
   *
   * Kalau ada:
   * <itunes:duration>01:30:00</itunes:duration>
   */
  const durationXml =
    duration
      ? `<itunes:duration>${xmlEscape(
          duration
        )}</itunes:duration>`
      : `<itunes:duration/>`;

  /*
   * Episode number / TMDB ID.
   */
  const episodeNumberXml =
    movieId
      ? `<itunes:episode>${xmlEscape(
          movieId
        )}</itunes:episode>`
      : "";

  /*
   * Poster TMDB.
   */
  const imageXml =
    episodeArtwork
      ? `<itunes:image href="${xmlAttribute(
          episodeArtwork
        )}"/>`
      : "";

  /*
   * PENTING:
   * Description TIDAK memakai xmlEscape().
   */
  return `<item>
<title>${xmlEscape(title)}</title>
<description>${rssDescription(description)}</description>
<guid isPermaLink="false">${xmlEscape(guid)}</guid>
<pubDate>${xmlEscape(pubDate)}</pubDate>
<enclosure url="${xmlAttribute(audioUrl)}" length="${xmlAttribute(audioLength)}" type="audio/mpeg"/>
<itunes:episodeType>full</itunes:episodeType>
${durationXml}
${episodeNumberXml}
${imageXml}
</item>`;
}

/* =========================
   GET /api/rss
========================= */

export async function onRequestGet(
  context
) {
  try {
    const env =
      context.env || {};

    const workerUrl =
      cleanBaseUrl(
        env.R2_UPLOAD_URL || ""
      );

    const workerSecret =
      String(
        env.R2_UPLOAD_SECRET || ""
      ).trim();

    if (
      !workerUrl ||
      !workerSecret
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Missing R2_UPLOAD_URL or R2_UPLOAD_SECRET environment variable.",
        }),
        {
          status: 500,
          headers: {
            "Content-Type":
              "application/json; charset=utf-8",
          },
        }
      );
    }

    /*
     * Ambil config + manifest
     * langsung dari Worker.
     */
    const [
      configResponse,
      manifestResponse,
    ] = await Promise.all([
      fetchWorkerJson(
        `${workerUrl}/podcast-config`,
        workerSecret
      ),

      fetchWorkerJson(
        `${workerUrl}/manifest`,
        workerSecret
      ),
    ]);

    const config =
      normalizeConfig(
        configResponse
      );

    const episodes =
      normalizeEpisodes(
        manifestResponse
      );

    const artworkUrl =
      normalizeUrl(
        config.artworkUrl,
        DEFAULT_ARTWORK
      );

    const author =
      config.author;

    const email =
      config.email;

    /*
     * Owner
     */
    const ownerXml =
      author || email
        ? `<itunes:owner>
<itunes:name>${xmlEscape(author)}</itunes:name>
<itunes:email>${xmlEscape(email)}</itunes:email>
</itunes:owner>`
        : "";

    /*
     * Channel artwork
     */
    const channelImageXml =
      artworkUrl
        ? `<itunes:image href="${xmlAttribute(
            artworkUrl
          )}"/>`
        : "";

    /*
     * Standard RSS image.
     *
     * Sesuai contoh user:
     * hanya url + title.
     */
    const standardImageXml =
      artworkUrl
        ? `<image>
<url>${xmlEscape(
            artworkUrl
          )}</url>
<title>${xmlEscape(
            config.title
          )}</title>
</image>`
        : "";

    /*
     * Category
     */
    const categoryXml =
      config.category
        ? `<itunes:category text="${xmlAttribute(
            config.category
          )}"/>`
        : "";

    /*
     * Episodes
     */
    const episodeXml =
      episodes
        .map(
          (
            episode,
            index
          ) =>
            buildEpisodeXml(
              episode,
              index,
              artworkUrl
            )
        )
        .filter(Boolean)
        .join("\n");

    /*
     * Last build date
     */
    const lastBuildDate =
      episodes.length > 0
        ? formatPubDate(
            getEpisodeDate(
              episodes[0]
            )
          )
        : new Date().toUTCString();

    /*
     * REQUEST URL
     */
    const requestUrl =
      new URL(
        context.request.url
      );

    /*
     * RSS FINAL
     *
     * Tidak ada:
     * - XML declaration
     * - blank line
     * - indentation
     * - atom:link
     * - channel <link>
     *
     * Sesuai contoh user.
     */
    const rssXml = `<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
<channel>
<title>${xmlEscape(
      config.title
    )}</title>
<description>${xmlEscape(
      config.description
    )}</description>
<language>${xmlEscape(
      config.language
    )}</language>
<lastBuildDate>${xmlEscape(
      lastBuildDate
    )}</lastBuildDate>
<generator> Movie Podcast Generator V${RSS_VERSION} </generator>
<itunes:author>${xmlEscape(
      author
    )}</itunes:author>
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
${standardImageXml}
${ownerXml}
${episodeXml}
</channel>
</rss>`;

    return new Response(
      rssXml,
      {
        status: 200,
        headers: {
          "Content-Type":
            "application/rss+xml; charset=utf-8",

          "Cache-Control":
            "no-cache, no-store, must-revalidate",

          Pragma: "no-cache",

          Expires: "0",

          "Access-Control-Allow-Origin":
            "*",
        },
      }
    );
  } catch (error) {
    console.error(
      "RSS generation error:",
      error
    );

    return new Response(
      JSON.stringify({
        success: false,
        error:
          "Failed to generate RSS feed.",
        message:
          error.message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type":
            "application/json; charset=utf-8",

          "Access-Control-Allow-Origin":
            "*",
        },
      }
    );
  }
}
