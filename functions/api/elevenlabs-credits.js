export async function onRequestGet(context) {
  const { env } = context;

  try {
    const apiKey = String(env.ELEVENLABS_API_KEY || "").trim();

    if (!apiKey) {
      return jsonResponse(
        {
          success: false,
          error: "ELEVENLABS_API_KEY is not configured."
        },
        500
      );
    }

    const response = await fetch(
      "https://api.elevenlabs.io/v1/user/subscription",
      {
        method: "GET",
        headers: {
          "xi-api-key": apiKey,
          "Accept": "application/json"
        }
      }
    );

    const text = await response.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!response.ok) {
      return jsonResponse(
        {
          success: false,
          error:
            `ElevenLabs error (${response.status}): ${
              text.slice(0, 500)
            }`
        },
        response.status
      );
    }

    /*
     * ElevenLabs subscription response normally contains:
     *
     * character_count
     * character_limit
     *
     * remaining_characters may also be available depending
     * on the API response/version.
     */

    const used = Number(data?.character_count || 0);

    const limit = Number(data?.character_limit || 0);

    let remaining = Number(
      data?.remaining_characters
    );

    if (!Number.isFinite(remaining)) {
      remaining = Math.max(
        0,
        limit - used
      );
    }

    return jsonResponse({
      success: true,

      used,

      remaining,

      limit,

      character_count: used,

      character_limit: limit,

      remaining_characters: remaining,

      subscription: {
        tier: data?.tier || "",
        status: data?.status || "",
        next_invoice: data?.next_invoice || null,
        currency: data?.currency || "",
        can_extend_character_limit:
          data?.can_extend_character_limit ?? null
      }
    });

  } catch (error) {

    return jsonResponse(
      {
        success: false,
        error:
          error?.message ||
          "Failed to fetch ElevenLabs credit."
      },
      500
    );
  }
}


/*
 * JSON response helper
 */

function jsonResponse(data, status = 200) {
  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store, no-cache, must-revalidate, proxy-revalidate",

        Pragma: "no-cache",

        Expires: "0",

        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}
