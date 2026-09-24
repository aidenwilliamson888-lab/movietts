export async function onRequestPost(context) {
  try {
    const apiKey = context.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      return json({
        error: "ELEVENLABS_API_KEY belum diset di Cloudflare."
      }, 500);
    }

    const body = await context.request.json();

    const text = String(body.text || "").trim();
    const voiceId = String(body.voiceId || "").trim();
    const modelId = String(body.modelId || "eleven_multilingual_v2").trim();
    const outputFormat = String(
      body.outputFormat || "mp3_22050_32"
    ).trim();

    if (!text) {
      return json({ error: "Text kosong." }, 400);
    }

    if (!voiceId) {
      return json({ error: "Voice ID belum diset." }, 400);
    }

    if (text.length > 1500) {
      return json({
        error: "Text terlalu panjang. Maksimal 1500 karakter."
      }, 400);
    }

    const allowedFormats = [
      "mp3_22050_32",
      "mp3_44100_64",
      "mp3_44100_96",
      "mp3_44100_128"
    ];

    const safeFormat = allowedFormats.includes(outputFormat)
      ? outputFormat
      : "mp3_22050_32";

    const elevenUrl =
      `https://api.elevenlabs.io/v1/text-to-speech/` +
      `${encodeURIComponent(voiceId)}` +
      `?output_format=${encodeURIComponent(safeFormat)}`;

    const response = await fetch(elevenUrl, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0,
          use_speaker_boost: true,
          speed: 1.0
        }
      })
    });

    if (!response.ok) {
      let errorMessage = `ElevenLabs error (${response.status})`;

      try {
        const errorData = await response.json();

        errorMessage =
          errorData?.detail?.message ||
          errorData?.detail?.status ||
          errorData?.message ||
          errorMessage;
      } catch (_) {}

      return json({
        error: errorMessage
      }, response.status);
    }

    const audio = await response.arrayBuffer();

    return new Response(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.byteLength),
        "Cache-Control": "no-store"
      }
    });

  } catch (error) {
    return json({
      error: error?.message || "Unexpected TTS error."
    }, 500);
  }
}


function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
