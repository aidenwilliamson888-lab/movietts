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

    const apiKey = context.env.REALWAY_API_KEY;
    const bucket = context.env.PODCAST_BUCKET;

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

    if (!bucket) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "PODCAST_BUCKET R2 binding is missing in Cloudflare Pages."
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

    if (!fileName.toLowerCase().endsWith(".mp3")) {
      fileName += ".mp3";
    }

    /*
     * ==========================================
     * RAILWAY EDGE TTS
     * ==========================================
     *
     * Jangan ubah endpoint/payload ini.
     * Ini adalah konfigurasi yang sudah terbukti
     * menghasilkan audio.
     */

    const response = await fetch(
      "https://openai-edge-tts-production-824f.up.railway.app/v1/audio/speech",
      {
        method: "POST",

        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
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

    if (!response.ok) {
      const errorText = await response.text();

      return new Response(
        JSON.stringify({
          success: false,
          error:
            `Railway TTS HTTP ${response.status}: ${errorText.slice(
              0,
              1500
            )}`
        }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    /*
     * ==========================================
     * GET AUDIO
     * ==========================================
     */

    const audio = await response.arrayBuffer();

    if (!audio.byteLength) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Railway TTS returned an empty audio file."
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    /*
     * ==========================================
     * UPLOAD TO CLOUDFLARE R2
     * ==========================================
     *
     * R2 key:
     *
     * episodes/{fileName}
     */

    const audioKey = `episodes/${fileName}`;

    try {
      await bucket.put(audioKey, audio, {
        httpMetadata: {
          contentType: "audio/mpeg",
          cacheControl: "public, max-age=31536000"
        },
        customMetadata: {
          voice: voice,
          model: model,
          outputFormat: outputFormat
        }
      });
    } catch (r2Error) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            `R2 upload failed: ${
              r2Error?.message || "Unknown R2 error."
            }`
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    /*
     * ==========================================
     * PUBLIC AUDIO URL
     * ==========================================
     */

    const audioUrl =
      `https://audio.onsports.online/${audioKey}`;

    /*
     * ==========================================
     * RESPONSE
     * ==========================================
     */

    return new Response(
      JSON.stringify({
        success: true,

        fileName: fileName,

        audioKey: audioKey,

        audioUrl: audioUrl,

        size: audio.byteLength,

        voice: voice,

        model: model,

        outputFormat: outputFormat
      }),
      {
        status: 200,

        headers: {
          "Content-Type": "application/json",

          "X-Audio-URL": audioUrl,

          "X-Audio-Key": audioKey,

          "X-File-Name": fileName,

          "X-Output-Format": outputFormat,

          "X-Model-ID": model,

          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          error?.message ||
          "Unknown TTS/R2 error."
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
}
