export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

    const text = String(body?.text || "").trim();

    if (!text) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "TTS text is required."
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    if (text.length > 1500) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "TTS text must be 1500 characters or less."
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    /*
     * ==========================================
     * ENVIRONMENT
     * ==========================================
     */

    const apiKey =
      context.env.REALWAY_API_KEY;

    const uploadUrl =
      context.env.R2_UPLOAD_URL;

    const uploadSecret =
      context.env.R2_UPLOAD_SECRET;

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "REALWAY_API_KEY is missing in Cloudflare Variables & Secrets."
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    if (!uploadUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "R2_UPLOAD_URL is missing in Cloudflare Variables & Secrets."
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    if (!uploadSecret) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "R2_UPLOAD_SECRET is missing in Cloudflare Variables & Secrets."
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    /*
     * ==========================================
     * TTS SETTINGS
     * ==========================================
     */

    const voice =
      String(body?.voiceId || "").trim() ||
      "en-US-AvaNeural";

    const model =
      String(body?.modelId || "").trim() ||
      "tts-1";

    const outputFormat =
      String(body?.outputFormat || "").trim() ||
      "mp3";

    let fileName =
      String(body?.fileName || "").trim() ||
      `podcast-${Date.now()}.mp3`;

    /*
     * Sanitize filename
     */

    fileName = fileName
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-");

    if (
      !fileName
        .toLowerCase()
        .endsWith(".mp3")
    ) {
      fileName += ".mp3";
    }

    /*
     * ==========================================
     * RAILWAY EDGE TTS
     * ==========================================
     */

    const ttsResponse = await fetch(
      "https://openai-edge-tts-production-824f.up.railway.app/v1/audio/speech",
      {
        method: "POST",

        headers: {
          "Authorization":
            `Bearer ${apiKey}`,

          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          model: model,
          input: text,
          voice: voice,
          response_format: outputFormat
        })
      }
    );

    /*
     * ==========================================
     * RAILWAY ERROR
     * ==========================================
     */

    if (!ttsResponse.ok) {
      const errorText =
        await ttsResponse.text();

      return new Response(
        JSON.stringify({
          success: false,
          error:
            `Railway TTS HTTP ${ttsResponse.status}: ${errorText.slice(
              0,
              1500
            )}`
        }),
        {
          status: ttsResponse.status,
          headers: {
            "Content-Type":
              "application/json"
          }
        }
      );
    }

    /*
     * ==========================================
     * GET MP3
     * ==========================================
     */

    const audio =
      await ttsResponse.arrayBuffer();

    if (!audio.byteLength) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Railway TTS returned an empty audio file."
        }),
        {
          status: 502,
          headers: {
            "Content-Type":
              "application/json"
          }
        }
      );
    }

    /*
     * ==========================================
     * R2 UPLOAD WORKER
     * ==========================================
     *
     * Worker endpoint:
     *
     * PUT /upload/{key}
     *
     * The Worker handles:
     *
     * R2 → movie-podcast
     */

    const audioKey =
      `episodes/${fileName}`;

    const normalizedUploadUrl =
      String(uploadUrl)
        .replace(/\/+$/, "");

    const uploadEndpoint =
      `${normalizedUploadUrl}/upload/${encodeURIComponent(
        audioKey
      )}`;

    const uploadResponse =
      await fetch(
        uploadEndpoint,
        {
          method: "PUT",

          headers: {
            "Authorization":
              `Bearer ${uploadSecret}`,

            "Content-Type":
              "audio/mpeg"
          },

          body: audio
        }
      );

    /*
     * ==========================================
     * R2 UPLOAD ERROR
     * ==========================================
     */

    if (!uploadResponse.ok) {
      const errorText =
        await uploadResponse.text();

      return new Response(
        JSON.stringify({
          success: false,
          error:
            `R2 Upload Worker HTTP ${uploadResponse.status}: ${errorText.slice(
              0,
              1500
            )}`
        }),
        {
          status: uploadResponse.status,
          headers: {
            "Content-Type":
              "application/json"
          }
        }
      );
    }

    /*
     * ==========================================
     * READ UPLOAD RESULT
     * ==========================================
     */

    let uploadResult = null;

    try {
      uploadResult =
        await uploadResponse.json();
    } catch {
      uploadResult = null;
    }

    /*
     * ==========================================
     * PUBLIC AUDIO URL
     * ==========================================
     */

    const audioUrl =
      uploadResult?.url ||
      `https://audio.onsports.online/${audioKey}`;

    /*
     * ==========================================
     * FINAL RESPONSE
     * ==========================================
     */

    return new Response(
      JSON.stringify({
        success: true,

        fileName:

          uploadResult?.key
            ? uploadResult.key
                .split("/")
                .pop()
            : fileName,

        audioKey:
          uploadResult?.key ||
          audioKey,

        audioUrl:
          audioUrl,

        size:
          audio.byteLength,

        voice:
          voice,

        model:
          model,

        outputFormat:
          outputFormat,

        uploaded:
          true
      }),
      {
        status: 200,

        headers: {
          "Content-Type":
            "application/json",

          "X-Audio-URL":
            audioUrl,

          "X-Audio-Key":
            uploadResult?.key ||
            audioKey,

          "X-File-Name":
            fileName,

          "X-Output-Format":
            outputFormat,

          "X-Model-ID":
            model,

          "Cache-Control":
            "no-store"
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,

        error:
          error?.message ||
          "Unknown TTS/R2 upload error."
      }),
      {
        status: 500,

        headers: {
          "Content-Type":
            "application/json"
        }
      }
    );
  }
}
