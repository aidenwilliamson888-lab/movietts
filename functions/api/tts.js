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
     * Temporary Edge-TTS test
     *
     * No ElevenLabs.
     * No R2.
     */

    const voice =
      String(body?.voiceId || "").trim() ||
      "en-US-AvaNeural";

    const response =
      await fetch(
        "https://tts.travisvn.com/v1/audio/speech",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "Authorization":
              "Bearer test"
          },

          body: JSON.stringify({
            model: "tts-1",
            input: text,
            voice: voice,
            response_format: "mp3"
          })
        }
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      return new Response(
        JSON.stringify({
          success: false,
          error:
            `Edge-TTS HTTP ${response.status}: ${errorText.slice(0, 1000)}`
        }),
        {
          status: response.status,
          headers: {
            "Content-Type":
              "application/json"
          }
        }
      );
    }

    const audio =
      await response.arrayBuffer();

    if (!audio.byteLength) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Edge-TTS returned an empty audio file."
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

    return new Response(
      audio,
      {
        status: 200,

        headers: {
          "Content-Type":
            "audio/mpeg",

          "X-Output-Format":
            "mp3",

          "X-Model-ID":
            "edge-tts",

          "X-File-Name":
            "test-edge-tts.mp3"
        }
      }
    );

  } catch (error) {

    return new Response(
      JSON.stringify({
        success: false,
        error:
          error?.message ||
          "Unknown Edge-TTS error."
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
