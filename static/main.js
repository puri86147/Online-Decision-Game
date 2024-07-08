const io = require('socket.io')(3000);
const suits = ['Spades', 'Diamonds', 'Clubs', 'Hearts'];
const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

let players = [];
let currentDealer = 0;
let currentTrump = 0;
let currentRound = 1;
let deck = [];
let currentPlayerIndex = 0;
let firstPlayerIndex = 0;

// Initialize deck
function initializeDeck() {
    deck = [];
    for (let suit of suits) {
        for (let rank of ranks) {
            deck.push({ suit, rank });
        }
    }
}

// Shuffle deck
function shuffleDeck() {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

// Determine card value
function cardValue(card) {
    return ranks.indexOf(card.rank);
}

// Deal cards
function dealCards() {
    shuffleDeck();
    players.forEach(player => {
        player.hand = deck.splice(0, 13);
        player.predictions = 0;
        player.tricksWon = 0;
    });
    firstPlayerIndex = (currentDealer + 1) % players.length;
    currentPlayerIndex = firstPlayerIndex;
    io.emit('deal', { players, currentTrump: suits[currentTrump] });
}

// Determine winner of the trick
function resolveTrick(trick) {
    let winningCard = trick[0];
    let winningPlayer = 0;
    for (let i = 1; i < trick.length; i++) {
        if (trick[i].suit === winningCard.suit && cardValue(trick[i]) > cardValue(winningCard)) {
            winningCard = trick[i];
            winningPlayer = i;
        } else if (trick[i].suit === suits[currentTrump]) {
            if (winningCard.suit !== suits[currentTrump] || cardValue(trick[i]) > cardValue(winningCard)) {
                winningCard = trick[i];
                winningPlayer = i;
            }
        }
    }
    return winningPlayer;
}

// Evaluate predictions
function evaluatePredictions() {
    players.forEach(player => {
        if (player.predictions === player.tricksWon) {
            player.score += 10 + player.tricksWon;
        } else {
            player.score += player.tricksWon;
        }
    });
}

// Reset trump after every six rounds
function resetTrump() {
    if (currentRound % 6 === 0) {
        currentTrump = (currentTrump + 1) % suits.length;
    }
}

// Handle new connections
io.on('connection', socket => {
    socket.on('join', username => {
        const newPlayer = {
            id: socket.id,
            username: username,
            hand: [],
            predictions: 0,
            tricksWon: 0,
            score: 0
        };
        players.push(newPlayer);
        io.emit('updatePlayers', players);
    });

    socket.on('startGame', () => {
        if (players.length >= 2) {
            currentDealer = 0;
            currentRound = 1;
            currentTrump = 0;
            dealCards();
        }
    });

    socket.on('makePrediction', (playerId, prediction) => {
        const player = players.find(p => p.id === playerId);
        player.predictions = prediction;
        io.emit('updatePlayers', players);
    });

    socket.on('playCard', (playerId, card) => {
        const player = players.find(p => p.id === playerId);
        const cardIndex = player.hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
        if (cardIndex > -1) {
            const playedCard = player.hand.splice(cardIndex, 1)[0];
            io.emit('cardPlayed', { playerId, card: playedCard });
            if (players.every(p => p.hand.length === 0)) {
                const winningPlayerIndex = resolveTrick(trick);
                players[winningPlayerIndex].tricksWon++;
                io.emit('trickWon', { playerId: players[winningPlayerIndex].id });
                if (players[0].hand.length === 0) {
                    evaluatePredictions();
                    currentDealer = (currentDealer + 1) % players.length;
                    currentRound++;
                    resetTrump();
                    dealCards();
                } else {
                    currentPlayerIndex = (currentPlayerIndex + 1) % players.length;
                    io.emit('nextPlayer', { playerId: players[currentPlayerIndex].id });
                }
            }
        }
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        io.emit('updatePlayers', players);
    });
});
