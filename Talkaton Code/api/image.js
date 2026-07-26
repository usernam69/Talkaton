export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 60000);

  req.on("close", () => {
    controller.abort();
  });

  try {
    const prompt = String(req.body?.prompt || "").trim();

    if (!prompt) {
      clearTimeout(timeout);
      return res.status(400).json({
        error: "Image prompt is required."
      });
    }

    const response = await fetch(
      "https://api.openai.com/v1/images/generations",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${getOpenAIApiKey()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-image-1-mini",
          prompt,
          size: "1024x1024",
          quality: "low"
        })
      }
    );

    let data;

    try {
      data = await response.json();
    } catch {
      const text = await response.text();

      clearTimeout(timeout);

      return res.status(500).json({
        error: "OpenAI returned invalid JSON.",
        response: text
      });
    }

    if (!response.ok) {
      clearTimeout(timeout);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          `OpenAI request failed (${response.status})`,
        details: data
      });
    }

    if (!Array.isArray(data.data) || data.data.length === 0) {
      clearTimeout(timeout);

      return res.status(500).json({
        error: "No image was returned.",
        details: data
      });
    }

    const image = data.data[0];

    clearTimeout(timeout);

    return res.status(200).json({
      success: true,
      image,
      provider: "openai",
      model: "gpt-image-1-mini"
    });
  } catch (err) {
    clearTimeout(timeout);

    if (err.name === "AbortError") {
      return res.status(504).json({
        error: "Image generation timed out."
      });
    }

    console.error(err);

    return res.status(500).json({
      error: err.message || "Unknown server error."
    });
  }
}

function getOpenAIApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();

  if (!key) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  return key.startsWith("Bearer ")
    ? key.slice(7)
    : key;
}