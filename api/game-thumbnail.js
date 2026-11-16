import { Buffer } from "node:buffer";
import sharp from "sharp";

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

function sendError(res, status, message) {
    res.statusCode = status;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(message);
}

export default async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD");
        res.status(405).end("Method not allowed");
        return;
    }

    const requestUrl = new URL(req.url, "https://vortexgames.invalid");
    const gameIdText = requestUrl.searchParams.get("gameId");
    if (!/^\d+$/.test(gameIdText ?? "")) {
        sendError(res, 400, "Invalid game ID");
        return;
    }

    const gameId = Number(gameIdText);
    if (!Number.isSafeInteger(gameId) || gameId < 1) {
        sendError(res, 400, "Invalid game ID");
        return;
    }

    const sourceUrl = new URL(`https://playvortex.io/assets/thumbnails/${gameId}`);
    const version = requestUrl.searchParams.get("version");
    if (version) {
        sourceUrl.searchParams.set("v", version.slice(0, 128));
    }

    let response;
    try {
        response = await fetch(sourceUrl, { signal: AbortSignal.timeout(5000) });
    } catch {
        sendError(res, 502, "Unable to load the game thumbnail");
        return;
    }

    if (response.status === 404) {
        sendError(res, 404, "Thumbnail not found");
        return;
    }
    if (!response.ok) {
        sendError(res, 502, "Unable to load the game thumbnail");
        return;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("image/")) {
        sendError(res, 502, "The thumbnail service returned a non-image response");
        return;
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_SOURCE_BYTES) {
        sendError(res, 413, "The thumbnail is too large to process");
        return;
    }

    let source;
    try {
        source = Buffer.from(await response.arrayBuffer());
    } catch {
        sendError(res, 502, "Unable to read the game thumbnail");
        return;
    }
    if (source.length > MAX_SOURCE_BYTES) {
        sendError(res, 413, "The thumbnail is too large to process");
        return;
    }

    let thumbnail;
    try {
        thumbnail = await sharp(source, { limitInputPixels: 40_000_000 })
            .resize({ width: 300, withoutEnlargement: true })
            .webp({ quality: 85 })
            .toBuffer();
    } catch {
        sendError(res, 502, "Unable to resize the game thumbnail");
        return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Content-Length", thumbnail.length);
    res.setHeader(
        "Cache-Control",
        version ? "public, max-age=31536000, immutable" : "public, max-age=300",
    );
    res.end(req.method === "HEAD" ? undefined : thumbnail);
}
