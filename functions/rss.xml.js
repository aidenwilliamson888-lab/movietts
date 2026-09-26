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

export async function onRequestGet(context) {
  try {
    const {
      workerUrl,
      secret
    } = getWorkerConfig(
      context.env
    );

    const incomingUrl =
      new URL(
        context.request.url
      );

    const filename =
      incomingUrl.pathname
        .split("/")
        .pop();

    if (
      !filename ||
      !/^\d{3}-\d{2}-\d{2}-\d{2}\.xml$/
        .test(filename)
    ) {
      return new Response(
        "Invalid RSS filename.",
        {
          status: 400,
          headers: {
            "Content-Type":
              "text/plain; charset=utf-8"
          }
        }
      );
    }

    const response =
      await fetch(
        `${workerUrl}/rss/${encodeURIComponent(filename)}`,
        {
          method: "GET",
          headers: {
            "Authorization":
              `Bearer ${secret}`
          }
        }
      );

    if (!response.ok) {
      const text =
        await response.text();

      return new Response(
        text ||
          "RSS feed not found.",
        {
          status:
            response.status,
          headers: {
            "Content-Type":
              "text/plain; charset=utf-8"
          }
        }
      );
    }

    const headers =
      new Headers(
        response.headers
      );

    headers.set(
      "Content-Type",
      "application/rss+xml; charset=utf-8"
    );

    headers.set(
      "Cache-Control",
      "public, max-age=31536000, immutable"
    );

    headers.set(
      "Access-Control-Allow-Origin",
      "*"
    );

    return new Response(
      response.body,
      {
        status: 200,
        headers
      }
    );

  } catch (error) {
    return new Response(
      `RSS error: ${
        error.message ||
        "Unknown error"
      }`,
      {
        status: 500,
        headers: {
          "Content-Type":
            "text/plain; charset=utf-8"
        }
      }
    );
  }
}
