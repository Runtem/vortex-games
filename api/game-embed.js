function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function sendHtml(res, status, html) {
    res.statusCode = status;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(html);
}

function errorPage(title, message) {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
</head>
<body>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(message)}</p>
</body>
</html>`;
}

export default async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD");
        res.status(405).end("Method not allowed");
        return;
    }

    const gameIdText = new URL(req.url, "https://vortexgames.invalid").searchParams.get("gameId");
    if (!/^\d+$/.test(gameIdText ?? "")) {
        sendHtml(res, 400, errorPage("Invalid game ID", "Game IDs must be positive integers."));
        return;
    }

    const gameId = Number(gameIdText);
    if (!Number.isSafeInteger(gameId) || gameId < 1) {
        sendHtml(res, 400, errorPage("Invalid game ID", "Game IDs must be positive integers."));
        return;
    }

    let response;
    try {
        response = await fetch(`https://playvortex.io/api/games/${gameId}`, {
            signal: AbortSignal.timeout(5000),
        });
    } catch {
        sendHtml(res, 502, errorPage("Game unavailable", "Unable to check this game right now."));
        return;
    }

    if (response.status === 404) {
        sendHtml(res, 404, errorPage("Game not found", "This game ID is invalid or unavailable."));
        return;
    }
    if (!response.ok) {
        sendHtml(res, 502, errorPage("Game unavailable", "Unable to check this game right now."));
        return;
    }

    let game;
    try {
        game = await response.json();
    } catch {
        sendHtml(res, 502, errorPage("Game unavailable", "The game service returned an invalid response."));
        return;
    }

    if (game?.id !== gameId) {
        sendHtml(res, 404, errorPage("Game not found", "This game ID is invalid or unavailable."));
        return;
    }

    const playUrl = `https://playvortex.io/games/${gameId}/play`;
    const userAgent = req.headers["user-agent"] ?? "";
    if (!/Discordbot/i.test(userAgent)) {
        res.statusCode = 302;
        res.setHeader("Location", playUrl);
        res.setHeader("Cache-Control", "no-store");
        res.end();
        return;
    }

    const title = `${game.name || `Game ${gameId}`} | Vortex Games`;
    const description = game.description || `Play ${game.name || `game ${gameId}`} on Vortex.`;
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const pageUrl = new URL(`/${gameId}`, `${protocol}://${host}`).href;
    const thumbnailVersion = game.thumbnail_version
        ? `?v=${encodeURIComponent(game.thumbnail_version)}`
        : "";
    const imageUrl = `https://playvortex.io/assets/thumbnails/${gameId}${thumbnailVersion}`;
    const safeTitle = escapeHtml(title);
    const safeDescription = escapeHtml(description);
    const safePageUrl = escapeHtml(pageUrl);
    const safeImageUrl = escapeHtml(imageUrl);

    sendHtml(
        res,
        200,
        `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Vortex Games">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDescription}">
    <meta property="og:url" content="${safePageUrl}">
    <meta property="og:image" content="${safeImageUrl}">
    <meta property="og:image:alt" content="${safeTitle}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${safeTitle}">
    <meta name="twitter:description" content="${safeDescription}">
    <meta name="twitter:image" content="${safeImageUrl}">
</head>
<body>
    <h1>${safeTitle}</h1>
    <p>${safeDescription}</p>
    <a href="${escapeHtml(playUrl)}">Play ${escapeHtml(game.name || `Game ${gameId}`)}</a>
</body>
</html>`,
    );
}
