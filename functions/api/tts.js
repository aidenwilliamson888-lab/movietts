export async function onRequestGet(context) {

  try {

    const url =
      new URL(context.request.url);

    const wantsVoices =
      url.searchParams.get("voices") === "1";

    if (!wantsVoices) {

      return json({
        error: "Invalid request."
      }, 400);

    }

    const apiKey =
      context.env.ELEVENLABS_API_KEY;

    if (!apiKey) {

      return json({
        error:
          "ELEVENLABS_API_KEY belum diset di Cloudflare."
      }, 500);

    }


    /*
      ElevenLabs current voices endpoint
    */

    const response =
      await fetch(
        "https://api.elevenlabs.io/v2/voices?page_size=100",
        {
          method: "GET",
          headers: {
            "xi-api-key": apiKey
          }
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      return json({
        error:
          data?.detail?.message ||
          data?.detail ||
          `ElevenLabs voices error (${response.status})`
      }, response.status);

    }


    /*
      Return only what the frontend needs.
    */

    const voices =
      (data.voices || []).map(voice => {

        const languages =
          (voice.verified_languages || [])
            .map(language =>
              language.language
            );

        return {

          voice_id:
            voice.voice_id,

          name:
            voice.name ||
            "Unnamed Voice",

          languages,

          category:
            voice.category || "",

          description:
            voice.description || ""

        };

      });


    return json({
      voices
    });

  } catch (error) {

    return json({
      error:
        error?.message ||
        "Unexpected ElevenLabs error."
    }, 500);

  }

}


/* =========================
   POST TTS
========================= */

export async function onRequestPost(context) {

  try {

    const apiKey =
      context.env.ELEVENLABS_API_KEY;

    if (!apiKey) {

      return json({
        error:
          "ELEVENLABS_API_KEY belum diset di Cloudflare."
      }, 500);

    }


    let body;

    try {

      body =
        await context.request.json();

    } catch (_) {

      return json({
        error: "Invalid JSON body."
      }, 400);

    }


    const text =
      String(body.text || "").trim();

    const voiceId =
      String(body.voiceId || "").trim();

    const modelId =
      String(
        body.modelId ||
        "eleven_multilingual_v2"
      ).trim();

    const outputFormat =
      String(
        body.outputFormat ||
        "mp3_22050_32"
      ).trim();


    if (!text) {

      return json({
        error: "TTS text is empty."
      }, 400);

    }


    if (!voiceId) {

      return json({
        error: "Voice ID is required."
      }, 400);

    }


    /*
      Safety limit for this endpoint.
      Our normal narration is much shorter.
    */

    if (text.length > 1500) {

      return json({
        error:
          "Narration is too long. Maximum 1500 characters."
      }, 400);

    }


    /*
      Only allow our intended MP3 format.
    */

    const allowedFormats = [
      "mp3_22050_32",
      "mp3_44100_64",
      "mp3_44100_96",
      "mp3_44100_128"
    ];

    const safeFormat =
      allowedFormats.includes(outputFormat)
        ? outputFormat
        : "mp3_22050_32";


    const endpoint =
      "https://api.elevenlabs.io/v1/text-to-speech/" +
      encodeURIComponent(voiceId) +
      "?output_format=" +
      encodeURIComponent(safeFormat);


    const response =
      await fetch(
        endpoint,
        {
          method: "POST",

          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg"
          },

          body: JSON.stringify({

            text,

            model_id:
              modelId,

            /*
              Voice settings can be adjusted later.
            */

            voice_settings: {

              stability: 0.5,

              similarity_boost: 0.75,

              style: 0,

              use_speaker_boost: true,

              speed: 1.0

            }

          })

        }
      );


    if (!response.ok) {

      let errorMessage =
        `ElevenLabs TTS failed (${response.status})`;

      try {

        const errorData =
          await response.json();

        errorMessage =
          errorData?.detail?.message ||
          errorData?.detail ||
          errorMessage;

      } catch (_) {}

      return json({
        error: errorMessage
      }, response.status);

    }


    /*
      ElevenLabs returns audio bytes.
      Stream them directly to browser.
    */

    const audio =
      await response.arrayBuffer();


    return new Response(
      audio,
      {
        status: 200,

        headers: {

          "Content-Type":
            "audio/mpeg",

          "Content-Length":
            String(audio.byteLength),

          "Cache-Control":
            "no-store"

        }
      }
    );


  } catch (error) {

    return json({

      error:
        error?.message ||
        "Unexpected TTS error."

    }, 500);

  }

}


/* =========================
   JSON RESPONSE
========================= */

function json(
  data,
  status = 200
) {

  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store"
      }
    }
  );

}
