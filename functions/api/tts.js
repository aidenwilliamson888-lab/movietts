export async function onRequestPost(context) {
  try {
    const env = context.env;

    if (!env.ELEVENLABS_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "ELEVENLABS_API_KEY is not configured"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    if (!env.R2_UPLOAD_URL) {
      return new Response(
        JSON.stringify({
          error: "R2_UPLOAD_URL is not configured"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    if (!env.R2_UPLOAD_SECRET) {
      return new Response(
        JSON.stringify({
          error: "R2_UPLOAD_SECRET is not configured"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const body = await context.request.json();

    const {
      text,
      voiceId,
      modelId = "eleven_multilingual_v2",
      outputFormat = "mp3_22050_32",
      fileName = "episode.mp3"
    } = body;

    if (!text) {
      return new Response(
        JSON.stringify({
          error: "Missing text"
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    if (!voiceId) {
      return new Response(
        JSON.stringify({
          error: "Missing voiceId"
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
          error: "Text is too long. Maximum 1500 characters."
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
     * STEP 1
     * Generate audio with ElevenLabs
     */

    const elevenResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(
        voiceId
      )}?output_format=${encodeURIComponent(outputFormat)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          "Accept": "audio/mpeg"
        },
        body: JSON.stringify({
          text,
          model_id: modelId
        })
      }
    );

    if (!elevenResponse.ok) {
      const errorText = await elevenResponse.text();

      return new Response(
        JSON.stringify({
          error: "ElevenLabs request failed",
          details: errorText
        }),
        {
          status: elevenResponse.status,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    /*
     * STEP 2
     * Send MP3 directly to Worker Account A
     */

    const safeFileName = String(fileName)
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-");

    const r2Key = `episodes/${safeFileName}`;

    const uploadUrl =
      env.R2_UPLOAD_URL.replace(/\/$/, "") +
      `/upload/${encodeURIComponent(r2Key)}`;

    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${env.R2_UPLOAD_SECRET}`,
        "Content-Type": "audio/mpeg"
      },
      body: elevenResponse.body
    });

    if (!uploadResponse.ok) {
      const uploadError = await uploadResponse.text();

      return new Response(
        JSON.stringify({
          error: "R2 upload failed",
          status: uploadResponse.status,
          details: uploadError
        }),
        {
          status: 502,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const uploadResult = await uploadResponse.json();

    /*
     * STEP 3
     * Return R2 information to Movie TTS
     */

    return new Response(
      JSON.stringify({
        success: true,
        fileName: safeFileName,
        key: r2Key,
        audioUrl: uploadResult.url,
        outputFormat,
        modelId
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error?.message || String(error)
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
