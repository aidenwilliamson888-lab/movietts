export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    if (!env.ELEVENLABS_API_KEY) {
      return jsonResponse(
        {
          success: false,
          error: "ELEVENLABS_API_KEY is not configured."
        },
        500
      );
    }

    if (!env.R2_UPLOAD_URL) {
      return jsonResponse(
        {
          success: false,
          error: "R2_UPLOAD_URL is not configured."
        },
        500
      );
    }

    if (!env.R2_UPLOAD_SECRET) {
      return jsonResponse(
        {
          success: false,
          error: "R2_UPLOAD_SECRET is not configured."
        },
        500
      );
    }

    const body = await request.json();

    const text = String(body?.text || "").trim();
    const voiceId = String(body?.voiceId || "").trim();
    const modelId =
      String(body?.modelId || "eleven_multilingual_v2").trim();

    const outputFormat =
      String(body?.outputFormat || "mp3_22050_32").trim();

    const fileName =
      String(body?.fileName || "episode.mp3").trim();


    if (!text) {
      return jsonResponse(
        {
          success: false,
          error: "TTS text is required."
        },
        400
      );
    }

    if (!voiceId) {
      return jsonResponse(
        {
          success: false,
          error: "ElevenLabs voiceId is required."
        },
        400
      );
    }

    if (text.length > 1500) {
      return jsonResponse(
        {
          success: false,
          error: "TTS text must be 1500 characters or less."
        },
        400
      );
    }


    /*
     * Sanitize filename
     */

    const safeFileName =
      fileName
        .replace(/[^a-zA-Z0-9._-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");


    const finalFileName =
      safeFileName.toLowerCase().endsWith(".mp3")
        ? safeFileName
        : `${safeFileName}.mp3`;


    /*
     * R2 object key
     *
     * IMPORTANT:
     * Keep "/" literal.
     */

    const r2Key =
      `episodes/${finalFileName}`;


    /*
     * ElevenLabs
     */

    const elevenLabsUrl =
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;


    const elevenLabsResponse =
      await fetch(elevenLabsUrl, {
        method: "POST",

        headers: {
          "xi-api-key": env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg"
        },

        body: JSON.stringify({
          text,
          model_id: modelId,
          output_format: outputFormat
        })
      });


    if (!elevenLabsResponse.ok) {

      const errorText =
        await elevenLabsResponse.text();

      return jsonResponse(
        {
          success: false,
          error:
            `ElevenLabs error (${elevenLabsResponse.status}): ${errorText}`
        },
        elevenLabsResponse.status
      );
    }


    /*
     * We need the same audio stream twice:
     *
     * Stream #1 → Worker → R2
     * Stream #2 → Browser → ZIP
     *
     * tee() duplicates the ReadableStream.
     */

    if (!elevenLabsResponse.body) {
      return jsonResponse(
        {
          success: false,
          error: "ElevenLabs returned an empty audio body."
        },
        502
      );
    }


    const [uploadStream, browserStream] =
      elevenLabsResponse.body.tee();


    /*
     * Upload to Account A Worker
     */

    const uploadUrl =
      env.R2_UPLOAD_URL.replace(/\/$/, "") +
      `/upload/${r2Key}`;


    const uploadResponse =
      await fetch(uploadUrl, {

        method: "PUT",

        headers: {
          "Authorization":
            `Bearer ${env.R2_UPLOAD_SECRET}`,

          "Content-Type":
            "audio/mpeg"
        },

        body: uploadStream

      });


    if (!uploadResponse.ok) {

      const uploadError =
        await uploadResponse.text();

      return jsonResponse(
        {
          success: false,

          error:
            `R2 upload failed (${uploadResponse.status}): ${uploadError}`
        },
        502
      );

    }


    /*
     * Public R2 URL
     *
     * IMPORTANT:
     * Replace this with your actual R2 custom domain.
     */

    const audioBaseUrl =
      "https://audio.onsports.online";


    const audioUrl =
      `${audioBaseUrl}/${r2Key}`;


    /*
     * Return MP3 directly to browser.
     *
     * Metadata is passed through response headers.
     *
     * Browser is same-origin with /api/tts,
     * so it does not need R2 CORS just to receive this MP3.
     */

    const headers =
      new Headers();

    headers.set(
      "Content-Type",
      "audio/mpeg"
    );

    headers.set(
      "Content-Disposition",
      `inline; filename="${finalFileName}"`
    );

    headers.set(
      "X-Audio-URL",
      audioUrl
    );

    headers.set(
      "X-Audio-Key",
      r2Key
    );

    headers.set(
      "X-File-Name",
      finalFileName
    );

    headers.set(
      "X-Output-Format",
      outputFormat
    );

    headers.set(
      "X-Model-ID",
      modelId
    );


    return new Response(
      browserStream,
      {
        status: 200,
        headers
      }
    );


  } catch (error) {

    return jsonResponse(
      {
        success: false,

        error:
          error?.message ||
          "Unknown TTS error."
      },
      500
    );

  }
}


/*
 * JSON helper
 */

function jsonResponse(data, status = 200) {

  return new Response(
    JSON.stringify(data, null, 2),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8"
      }
    }
  );

}
