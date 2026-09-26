function getWorkerConfig(env) {
  const workerUrl =
    String(
      env.R2_UPLOAD_URL || ""
    ).replace(/\/+$/, "");

  const secret =
    String(
      env.R2_UPLOAD_SECRET || ""
    );

  if (!workerUrl) {
    throw new Error(
      "R2_UPLOAD_URL is not configured."
    );
  }

  if (!secret) {
    throw new Error(
      "R2_UPLOAD_SECRET is not configured."
    );
  }

  return {
    workerUrl,
    secret
  };
}

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        "Cache-Control":
          "no-store",
        "Access-Control-Allow-Origin":
          "*"
      }
    }
  );
}

/*
 * =====================================================
 * OPTIONS / CORS
 * =====================================================
 */

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods":
        "POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type"
    }
  });
}

/*
 * =====================================================
 * POST /api/rss/create
 *
 * Pages Function
 *      ↓
 * R2 Upload Worker
 *      ↓
 * PODCAST_BUCKET
 *
 * Worker endpoint:
 * POST /rss/create
 * =====================================================
 */

export async function onRequestPost(context) {
  try {
    const {
      workerUrl,
      secret
    } = getWorkerConfig(
      context.env
    );

    /*
     * Read incoming JSON from frontend.
     */
    let data;

    try {
      data =
        await context.request.json();
    } catch {
      return json(
        {
          success: false,
          error:
            "Invalid JSON RSS payload."
        },
        400
      );
    }

    if (
      !data ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      return json(
        {
          success: false,
          error:
            "RSS payload must be an object."
        },
        400
      );
    }

    /*
     * Validate podcast object.
     */
    if (
      data.podcast !== undefined &&
      (
        !data.podcast ||
        typeof data.podcast !== "object" ||
        Array.isArray(data.podcast)
      )
    ) {
      return json(
        {
          success: false,
          error:
            "Podcast settings must be an object."
        },
        400
      );
    }

    /*
     * Validate episodes.
     */
    if (
      !Array.isArray(data.episodes)
    ) {
      return json(
        {
          success: false,
          error:
            "Episodes must be an array."
        },
        400
      );
    }

    /*
     * Hard frontend proxy safety limit.
     *
     * Worker itself also validates max 500.
     */
    if (
      data.episodes.length > 500
    ) {
      return json(
        {
          success: false,
          error:
            "Maximum 500 episodes per RSS Create."
        },
        400
      );
    }

    if (
      data.episodes.length === 0
    ) {
      return json(
        {
          success: false,
          error:
            "At least one episode is required."
        },
        400
      );
    }

    /*
     * pages_origin tells the Worker what public
     * Pages URL should be embedded into the RSS
     * response.
     *
     * Example:
     *
     * https://yourdomain.com
     *
     * becomes:
     *
     * https://yourdomain.com/api/rss/001-26-09-26.xml
     */
    const pagesOrigin =
      String(
        data.pages_origin ||
        new URL(
          context.request.url
        ).origin ||
        ""
      ).replace(/\/+$/, "");

    /*
     * Don't blindly forward arbitrary internal
     * fields.
     *
     * Keep the payload compatible with Worker.
     */
    const payload = {
      version:
        String(
          data.version ||
          "2.7"
        ),

      podcast:
        data.podcast || {},

      episodes:
        data.episodes,

      created_at:
        data.created_at ||
        new Date().toISOString(),

      pages_origin:
        pagesOrigin
    };

    /*
     * Send to the R2 Worker.
     */
    const response =
      await fetch(
        `${workerUrl}/rss/create`,
        {
          method: "POST",

          headers: {
            "Authorization":
              `Bearer ${secret}`,

            "Content-Type":
              "application/json",

            "Accept":
              "application/json"
          },

          body:
            JSON.stringify(
              payload
            )
        }
      );

    /*
     * Read Worker response safely.
     */
    const responseText =
      await response.text();

    let result;

    try {
      result =
        JSON.parse(
          responseText
        );
    } catch {
      result = {
        success: false,
        error:
          responseText ||
          "Invalid response from RSS Worker."
      };
    }

    /*
     * Forward Worker errors.
     */
    if (!response.ok) {
      return json(
        {
          success: false,

          error:
            result?.error ||
            result?.message ||
            responseText ||
            "RSS Worker request failed.",

          worker_status:
            response.status
        },
        response.status
      );
    }

    /*
     * Worker should return:
     *
     * {
     *   success: true,
     *   filename,
     *   key,
     *   sequence,
     *   date,
     *   episode_count,
     *   rss_url,
     *   created_at,
     *   etag
     * }
     *
     * We return the same data to frontend.
     */

    return json(
      {
        success:
          result?.success !== false,

        filename:
          result?.filename ||
          null,

        key:
          result?.key ||
          null,

        sequence:
          result?.sequence ??
          null,

        date:
          result?.date ||
          null,

        episode_count:
          result?.episode_count ??
          data.episodes.length,

        rss_url:
          result?.rss_url ||
          null,

        created_at:
          result?.created_at ||
          payload.created_at,

        etag:
          result?.etag ||
          null
      },
      200
    );

  } catch (error) {
    return json(
      {
        success: false,

        error:
          error?.message ||
          "RSS create error."
      },
      500
    );
  }
}
