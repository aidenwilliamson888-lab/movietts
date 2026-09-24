export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);

    const action = url.searchParams.get("action");
    const id = url.searchParams.get("id");
    const language =
      url.searchParams.get("language") || "en-US";

    const apiKey = context.env.TMDB_API_KEY;

    if (!apiKey) {
      return json(
        {
          error:
            "TMDB_API_KEY belum diset di Cloudflare."
        },
        500
      );
    }

    // =====================================================
    // ACTION: LANGUAGES
    // Mengambil semua Primary Translations dari TMDB
    // =====================================================

    if (action === "languages") {
      return await getLanguages(apiKey);
    }

    // =====================================================
    // MOVIE
    // =====================================================

    if (!id) {
      return json(
        {
          error: "TMDB ID is required."
        },
        400
      );
    }

    if (!/^\d+$/.test(id)) {
      return json(
        {
          error: "Invalid TMDB ID."
        },
        400
      );
    }

    // Validasi language sederhana.
    // Contoh:
    // en-US
    // id-ID
    // es-ES
    // pt-BR
    // ko-KR
    // ja-JP
    //
    // TMDB memakai IETF-style language tags.
    if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(language)) {
      return json(
        {
          error:
            "Invalid TMDB language format."
        },
        400
      );
    }

    // =====================================================
    // TMDB MOVIE REQUEST
    // =====================================================

    const tmdbUrl =
      `https://api.themoviedb.org/3/movie/` +
      `${encodeURIComponent(id)}` +
      `?api_key=${encodeURIComponent(apiKey)}` +
      `&language=${encodeURIComponent(language)}` +
      `&append_to_response=credits`;

    const response =
      await fetch(tmdbUrl);

    const data =
      await response.json();

    if (!response.ok) {
      return json(
        {
          error:
            data?.status_message ||
            `TMDB request failed (${response.status})`
        },
        response.status
      );
    }

    // =====================================================
    // BASIC DATA
    // =====================================================

    const year =
      data.release_date
        ? data.release_date.substring(0, 4)
        : "";

    // =====================================================
    // DIRECTOR
    // =====================================================

    const directors =
      data.credits?.crew
        ?.filter(
          person =>
            person.job === "Director"
        )
        ?.map(
          person => person.name
        )
        ?.join(", ") || "";

    // =====================================================
    // GENRES
    //
    // Genre akan mengikuti language yang dipilih
    // selama TMDB menyediakan terjemahannya.
    // =====================================================

    const genres =
      data.genres
        ?.map(
          genre => genre.name
        )
        ?.join(", ") || "";

    // =====================================================
    // CAST
    // =====================================================

    const cast =
      data.credits?.cast
        ?.slice(0, 10)
        ?.map(
          person => person.name
        )
        ?.join(", ") || "";

    // =====================================================
    // POSTER
    // =====================================================

    const poster =
      data.poster_path
        ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
        : null;

    // =====================================================
    // RESPONSE
    // =====================================================

    return json({
      id: data.id,

      language,

      title:
        data.title ||
        data.original_title ||
        `Movie ${id}`,

      originalTitle:
        data.original_title || "",

      originalLanguage:
        data.original_language || "",

      year,

      rating:
        data.vote_average ?? null,

      genres,

      director: directors,

      runtime:
        data.runtime || null,

      overview:
        data.overview || "",

      cast,

      poster,

      backdrop:
        data.backdrop_path
          ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}`
          : null
    });

  } catch (error) {
    return json(
      {
        error:
          error?.message ||
          "Unexpected TMDB error."
      },
      500
    );
  }
}


// =======================================================
// GET ALL TMDB PRIMARY TRANSLATIONS
// =======================================================

async function getLanguages(apiKey) {
  try {

    const tmdbUrl =
      `https://api.themoviedb.org/3/configuration/primary_translations` +
      `?api_key=${encodeURIComponent(apiKey)}`;

    const response =
      await fetch(tmdbUrl);

    const data =
      await response.json();

    if (!response.ok) {
      return json(
        {
          error:
            data?.status_message ||
            `TMDB languages request failed (${response.status})`
        },
        response.status
      );
    }

    /*
      TMDB returns an array such as:

      [
        "en-US",
        "es-ES",
        "fr-FR",
        "de-DE",
        ...
      ]
    */

    const languages =
      Array.isArray(data)
        ? data
        : [];

    return json({
      languages
    });

  } catch (error) {

    return json(
      {
        error:
          error?.message ||
          "Unable to load TMDB languages."
      },
      500
    );

  }
}


// =======================================================
// JSON RESPONSE
// =======================================================

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
