import "./App.css";
import Game from "./components/Game";
import { useEffect, useState } from "react";

function App() {
    const [gameId, setGameId] = useState("");
    const [selectedGameId, setSelectedGameId] = useState("");
    const [routeStatus, setRouteStatus] = useState("checking");
    const [routeError, setRouteError] = useState("");
    const routePath = window.location.pathname.replace(/^\/+|\/+$/g, "");

    useEffect(() => {
        if (!routePath) {
            return;
        }

        if (!/^\d+$/.test(routePath) || !Number.isSafeInteger(Number(routePath)) || Number(routePath) < 1) {
            setRouteStatus("invalid");
            return;
        }

        const controller = new AbortController();
        const id = Number(routePath);

        fetch(`/api/games/${id}`, { signal: controller.signal })
            .then((response) => {
                if (response.status === 404) {
                    setRouteStatus("invalid");
                    return null;
                }
                if (!response.ok) {
                    throw new Error(`Game lookup failed with status ${response.status}`);
                }
                return response.json();
            })
            .then((game) => {
                if (!game) {
                    return;
                }
                if (game.id !== id) {
                    setRouteStatus("invalid");
                    return;
                }
                window.location.replace(`https://playvortex.io/games/${id}/play`);
            })
            .catch((error) => {
                if (error.name === "AbortError") {
                    return;
                }
                setRouteError("Unable to verify this game right now. Please try again.");
                setRouteStatus("error");
            });

        return () => controller.abort();
    }, [routePath]);

    if (routePath) {
        if (routeStatus === "checking") {
            return <p>Checking game...</p>;
        }
        if (routeStatus === "invalid") {
            return <p>Invalid game ID.</p>;
        }
        if (routeStatus === "error") {
            return <p role="alert">{routeError}</p>;
        }
        return null;
    }

    return (
        <>
            <input
                type="text"
                placeholder="Enter game ID"
                value={gameId}
                onChange={(event) => setGameId(event.target.value)}
            />
            <button type="button" onClick={() => setSelectedGameId(gameId)}>
                Search for game...
            </button>
            {selectedGameId && <Game gameId={selectedGameId} />}
        </>
    );
}

export default App;
