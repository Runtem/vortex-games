import { useState, useEffect } from "react";

function Game({ gameId }) {
    const [gameData, setGameData] = useState(null);
    const [isInvalid, setIsInvalid] = useState(false);

    useEffect(() => {
        let isMounted = true;

        fetch(`/api/games/${gameId}`)
            .then((response) => {
                if (!response.ok) {
                    throw new Error("Game not found");
                }
                return response.json();
            })
            .then((data) => {
                if (!isMounted) return;

                const invalid =
                    data?.invalid === true ||
                    data?.is_valid === false ||
                    data?.status === "invalid" ||
                    data?.error === "invalid_game" ||
                    data?.game === null;

                setGameData(data);
                setIsInvalid(invalid);
            })
            .catch(() => {
                if (isMounted) {
                    setGameData(null);
                    setIsInvalid(true);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [gameId]);

    if (isInvalid) {
        return <div>This game is invalid or unavailable.</div>;
    }

    return (
        <div>
            <img src={`https://playvortex.io/assets/thumbnails/${gameId}?v=${gameData?.thumbnail_version}`} alt={gameData?.name} width="200" />
            <h2>{gameData?.name}</h2>
            <p>{gameData?.description}</p>
            <a href={`https://playvortex.io/games/${gameId}/play`} target="_blank" rel="noopener noreferrer">
                Play Game
            </a>
        </div>
    );
}

export default Game;