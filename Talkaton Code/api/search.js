export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { query } = req.body || {};

    if (!process.env.TAVILY_API_KEY) {
      return res.status(500).json({
        error: "Missing TAVILY_API_KEY. Add it to your deployment environment variables."
      });
    }

    if (!query || typeof query !== "string") {
      return res.status(400).json({ error: "Search query is required." });
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: "advanced",
        include_answer: true,
        max_results: 5
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error || data?.message || "Search request failed."
      });
    }

    res.status(200).json({
      answer: data.answer || "No results found.",
      results: (data.results || []).map(r => ({
        title: r.title || "",
        url: r.url || "",
        content: r.content || ""
      }))
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Search failed" });
  }
}
