export async function onRequestGet(context) {

  const url = new URL(context.request.url);

  const movieId = url.searchParams.get("id");

  if (!movieId) {
    return json({
      error: "TMDB Movie ID is required."
    }, 400);
  }

  const apiKey = context.env.TMDB_API_KEY;

  if (!apiKey) {
    return json({
      error: "TMDB_API_KEY belum diset di Cloudflare."
    }, 500);
  }

  const tmdbUrl =
    "https://api.themoviedb.org/3/movie/" +
    encodeURIComponent(movieId) +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=id-ID&append_to_response=credits";

  try {

    const response = await fetch(tmdbUrl);

    const data = await response.json();

    if (!response.ok) {

      return json({
        error: data.status_message || "TMDB API error."
      }, response.status);

    }

    const title =
      data.title ||
      data.original_title ||
      "";

    const year =
      data.release_date
        ? data.release_date.substring(0, 4)
        : "";

    const genres =
      Array.isArray(data.genres)
        ? data.genres.map(g => g.name).join(", ")
        : "";

    let director = "";

    if (
      data.credits &&
      Array.isArray(data.credits.crew)
    ) {

      const directors =
        data.credits.crew.filter(
          person => person.job === "Director"
        );

      if (directors.length) {
        director = directors[0].name;
      }
    }

    const cast =
      data.credits &&
      Array.isArray(data.credits.cast)
        ? data.credits.cast
            .slice(0, 10)
            .map(person => person.name)
            .join(", ")
        : "";

    const poster =
      data.poster_path
        ? "https://image.tmdb.org/t/p/w500" +
          data.poster_path
        : "";

    return json({

      id: data.id,

      title,

      originalTitle:
        data.original_title || "",

      year,

      rating:
        data.vote_average
          ? Number(data.vote_average).toFixed(1)
          : "",

      genres,

      director,

      runtime:
        data.runtime || "",

      overview:
        data.overview || "",

      cast,

      poster

    });

  } catch (error) {

    return json({
      error: error.message
    }, 500);

  }
}


function json(data, status = 200) {

  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );

}
