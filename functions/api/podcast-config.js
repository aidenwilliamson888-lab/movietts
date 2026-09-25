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

export async function onRequestGet(context) {
  try {
    const response = await workerFetch(
      context.env,
      "/podcast-config",
      {
        method: "GET"
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return json({
        success: false,
        error: data?.error ||
          `Worker GET /podcast-config failed (${response.status}).`
      }, 500);
    }

    return json({
      success: true,
      exists: data?.exists || false,
      config: data?.config || null
    }, 200, {
      "Cache-Control": "no-store"
    });

  } catch (error) {
    return json({
      success: false,
      error: error.message || "Failed to get podcast config."
    }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    const config = await context.request.json();

    if (!config || typeof config !== "object" || Array.isArray(config)) {
      return json({
        success: false,
        error: "Podcast config must be a JSON object."
      }, 400);
    }

    const cleanConfig = {
      podcast_title: String(config.podcast_title || "").trim(),
      podcast_description: String(config.podcast_description || "").trim(),
      author: String(config.author || "").trim(),
      email: String(config.email || "").trim(),
      artwork_url: String(config.artwork_url || "").trim(),
      website_url: String(config.website_url || "").trim(),
      category: String(config.category || "TV & Film").trim(),
      language: String(config.language || "en-us").trim(),
      explicit: Boolean(config.explicit),
      podcast_type: String(config.podcast_type || "episodic").trim(),

      updated_at: new Date().toISOString()
    };

    const response = await workerFetch(
      context.env,
      "/podcast-config",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        },
        body: JSON.stringify(cleanConfig)
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return json({
        success: false,
        error: data?.error ||
          `Worker PUT /podcast-config failed (${response.status}).`
      }, 500);
    }

    return json({
      success: true,
      message: "Podcast config saved successfully.",
      config: cleanConfig,
      worker: data
    });

  } catch (error) {
    return json({
      success: false,
      error: error.message || "Failed to save podcast config."
    }, 500);
  }
}
