function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
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

async function workerFetch(env, path, options = {}) {
  const { workerUrl, secret } = getWorkerConfig(env);

  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${secret}`);

  return fetch(`${workerUrl}${path}`, {
    ...options,
    headers
  });
}

async function getCurrentManifest(env) {
  const response = await workerFetch(env, "/manifest", {
    method: "GET"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Worker GET /manifest failed (${response.status}): ${text}`
    );
  }

  const data = await response.json();

  if (!data.exists || !data.manifest) {
    return {
      version: "2.6",
      podcast: {},
      episodes: []
    };
  }

  return data.manifest;
}

function normalizeEpisodes(episodes) {
  if (!Array.isArray(episodes)) return [];

  return episodes
    .filter(item => item && typeof item === "object")
    .map(item => ({
      guid: item.guid || item.audio_url || item.audio_key || null,
      id: item.id ?? null,
      title: item.title || "",
      description: item.description || "",
      movie_title: item.movie_title || "",
      year: item.year ?? null,

      audio_filename: item.audio_filename || "",
      audio_url: item.audio_url || "",
      audio_key: item.audio_key || "",
      audio_size: Number(item.audio_size || 0),

      duration: item.duration ?? null,
      poster: item.poster || "",
      generated_at: item.generated_at || new Date().toISOString(),

      language: item.language || "",
      category: item.category || "",

      tmdb_id: item.tmdb_id ?? item.id ?? null
    }))
    .filter(item => item.guid || item.audio_url || item.audio_key);
}

function mergeEpisodes(existingEpisodes, newEpisodes) {
  const map = new Map();

  for (const episode of normalizeEpisodes(existingEpisodes)) {
    const key =
      episode.guid ||
      episode.audio_url ||
      episode.audio_key;

    if (key) {
      map.set(String(key), episode);
    }
  }

  for (const episode of normalizeEpisodes(newEpisodes)) {
    const key =
      episode.guid ||
      episode.audio_url ||
      episode.audio_key;

    if (key) {
      map.set(String(key), episode);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const dateA = new Date(a.generated_at || 0).getTime();
    const dateB = new Date(b.generated_at || 0).getTime();

    return dateB - dateA;
  });
}

export async function onRequestGet(context) {
  try {
    const manifest = await getCurrentManifest(context.env);

    return json({
      success: true,
      manifest
    }, 200, {
      "Cache-Control": "no-store"
    });

  } catch (error) {
    return json({
      success: false,
      error: error.message || "Failed to get manifest."
    }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const incoming = await context.request.json();

    if (!incoming || typeof incoming !== "object") {
      return json({
        success: false,
        error: "Manifest must be a JSON object."
      }, 400);
    }

    const existing = await getCurrentManifest(context.env);

    const mergedEpisodes = mergeEpisodes(
      existing.episodes || [],
      incoming.episodes || []
    );

    const manifest = {
      version: incoming.version || existing.version || "2.6",

      podcast: {
        ...(existing.podcast || {}),
        ...(incoming.podcast || {})
      },

      episodes: mergedEpisodes,

      updated_at: new Date().toISOString()
    };

    const response = await workerFetch(context.env, "/manifest", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json; charset=utf-8"
      },
      body: JSON.stringify(manifest)
    });

    const workerResult = await response.json().catch(() => null);

    if (!response.ok) {
      return json({
        success: false,
        error: workerResult?.error ||
          `Worker PUT /manifest failed (${response.status}).`
      }, 500);
    }

    return json({
      success: true,
      message: "Manifest synced successfully.",
      episode_count: mergedEpisodes.length,
      updated_at: manifest.updated_at,
      worker: workerResult
    });

  } catch (error) {
    return json({
      success: false,
      error: error.message || "Failed to sync manifest."
    }, 500);
  }
}
