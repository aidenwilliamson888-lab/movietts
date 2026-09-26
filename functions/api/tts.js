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
     * REALWAY / OPENAI EDGE TTS
     * ==========================================
     */

    const apiKey = context.env.REALWAY_API_KEY;

console.log(
  "REALWAY_API_KEY exists:",
  !!apiKey
);

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "REALWAY_API_KEY is missing in Cloudflare Variables & Secrets."
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const voice =
      String(body?.voiceId || "").trim() ||
      "en-US-AvaNeural";

    const model =
      String(body?.modelId || "").trim() ||
      "tts-1";

    const outputFormat =
      String(body?.outputFormat || "").trim() ||
      "mp3";

    const fileName =
      String(body?.fileName || "").trim() ||
      `podcast-${Date.now()}.mp3`;

    /*
     * Railway TTS endpoint
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
     * Handle Railway / TTS errors
     */

    if (!response.ok) {
      const errorText = await response.text();

      return new Response(
        JSON.stringify({
          success: false,
          error:
            `Realway TTS HTTP ${response.status}: ${errorText.slice(
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
     * Get MP3
     */

    const audio = await response.arrayBuffer();

    if (!audio.byteLength) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Realway returned an empty audio file."
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
     * RETURN AUDIO TO FRONTEND
     * ==========================================
     *
     * Untuk tahap ini kita return MP3 langsung.
     * R2 bisa kita sambungkan setelah TTS
     * sudah confirmed bekerja dari frontend.
     */

    return new Response(audio, {
      status: 200,

      headers: {
        "Content-Type": "audio/mpeg",

        "Content-Length":
          String(audio.byteLength),

        "X-Output-Format":
          outputFormat,

        "X-Model-ID":
          model,

        "X-File-Name":
          fileName,

        "Cache-Control":
          "no-store"
      }
    });

  } catch (error) {

    return new Response(
      JSON.stringify({
        success: false,
        error:
          error?.message ||
          "Unknown Realway TTS error."
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
