import { Buffer } from "node:buffer";

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

function formatDate(value) {
    const timestamp = typeof value === "number" ? value * 1000 : Date.parse(value);
    if (!Number.isFinite(timestamp)) {
        return "Unknown";
    }

    return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
    }).format(new Date(timestamp));
}

function truncateUtf8(value, maxBytes) {
    let result = "";
    let bytes = 0;
    for (const character of String(value ?? "")) {
        const characterBytes = Buffer.byteLength(character, "utf8");
        if (bytes + characterBytes > maxBytes) {
            break;
        }
        result += character;
        bytes += characterBytes;
    }
    return result;
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

    const userAgent = req.headers["user-agent"] ?? "";
    const isDiscordCrawler = /Discordbot/i.test(userAgent);
    let response;
    let statsResponse;
    try {
        [response, statsResponse] = await Promise.all([
            fetch(`https://playvortex.io/api/games/${gameId}`, {
                signal: AbortSignal.timeout(5000),
            }),
            isDiscordCrawler
                ? fetch("https://playvortex.io/api/game-stats", {
                    signal: AbortSignal.timeout(5000),
                })
                : Promise.resolve(null),
        ]);
    } catch {
        sendHtml(res, 502, errorPage("Game unavailable", "Unable to load the game preview data right now."));
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
    if (!isDiscordCrawler) {
        res.statusCode = 302;
        res.setHeader("Location", playUrl);
        res.setHeader("Cache-Control", "no-store");
        res.end();
        return;
    }

    if (!statsResponse?.ok) {
        sendHtml(res, 502, errorPage("Game unavailable", "Unable to load game statistics right now."));
        return;
    }

    let gameStats;
    try {
        gameStats = await statsResponse.json();
    } catch {
        sendHtml(res, 502, errorPage("Game unavailable", "The game statistics service returned an invalid response."));
        return;
    }

    const stats = gameStats?.[String(gameId)];
    const visits = Number.isSafeInteger(stats?.visits) && stats.visits >= 0
        ? new Intl.NumberFormat("en-US").format(stats.visits)
        : "Unavailable";
    const name = game.name || `Game ${gameId}`;
    const author = game.creator_name || "Unknown";
    const title = truncateUtf8(name, 180);
    const componentAuthor = truncateUtf8(author, 120);
    const updatedAt = formatDate(game.map_updated_at ?? game.created_at);
    const gameDescription = truncateUtf8(
        game.description || `Play ${name} on Vortex.`,
        1200,
    );
    const description = [
        `By **${author}**`,
        `${visits} visits`,
        `Last updated ${updatedAt}`,
        game.description || `Play ${name} on Vortex.`,
    ].join("\n");
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const pageUrl = new URL(`/${gameId}`, `${protocol}://${host}`).href;
    const thumbnailVersion = game.thumbnail_version
        ? `?v=${encodeURIComponent(String(game.thumbnail_version).slice(0, 128))}`
        : "";
    const imageUrl = `https://playvortex.io/assets/thumbnails/${gameId}${thumbnailVersion}`;
    const safeTitle = escapeHtml(title);
    const safeDescription = escapeHtml(description);
    const safePageUrl = escapeHtml(pageUrl);
    const safeImageUrl = escapeHtml(imageUrl);
    const component = {
        type: 17,
        accent_color: 0xA955F7,
        components: [
            {
                type: 12,
                items: [
                    { media: { url: imageUrl } }
                ]
            },
            {
                type: 10,
                content: `# [${title}](${pageUrl})\nBy **${componentAuthor}**\n\n**${visits} visits** · Last updated ${updatedAt}`,
            },
            { type: 14, spacing: 1 },
            { type: 10, content: gameDescription },
            {
                type: 1,
                components: [
                    {
                        type: 2,
                        style: 5,
                        url: playUrl,
                        label: "Play Game",
                    },
                ],
            },
        ],
    };
    let componentDescription = gameDescription;
    let componentJson = JSON.stringify({ component }).replace(/</g, "\\u003c");
    while (Buffer.byteLength(componentJson, "utf8") > 3000 && componentDescription) {
        componentDescription = truncateUtf8(
            componentDescription,
            Math.max(0, Buffer.byteLength(componentDescription, "utf8") - 100),
        );
        component.components[3].content = componentDescription;
        componentJson = JSON.stringify({ component }).replace(/</g, "\\u003c");
    }
    if (Buffer.byteLength(componentJson, "utf8") > 3000) {
        sendHtml(res, 500, errorPage("Game unavailable", "The game details are too large to create a Discord preview."));
        return;
    }

    sendHtml(
        res,
        200,
        `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#a955f7">
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
    <script id="discord:component-embed" type="application/json">${componentJson}</script>
</head>
<body>
    <h1>${safeTitle}</h1>
    <p>${safeDescription}</p>
    <a href="${escapeHtml(playUrl)}">Play ${escapeHtml(game.name || `Game ${gameId}`)}</a>
</body>
</html>`,
    );
}
