const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = 3000;

const rooms = new Map();

const colors = ['red', 'yellow', 'green', 'blue'];
const values = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', '+2'];

function createDeck() {
    const deck = [];
    colors.forEach(color => {
        values.forEach(value => {
            deck.push({ color, value });
            if (value !== '0') {
                deck.push({ color, value });
            }
        });
    });
    for (let i = 0; i < 4; i++) {
        deck.push({ color: 'wild', value: 'wild' });
        deck.push({ color: 'wild', value: 'wild+4' });
    }
    return shuffleDeck(deck);
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function canPlayCard(card, topCard, currentColor) {
    if (card.color === 'wild') return true;
    if (card.color === currentColor) return true;
    if (card.value === topCard.value) return true;
    return false;
}

function getPlayableCards(hand, topCard, currentColor) {
    return hand.map((card, index) => 
        canPlayCard(card, topCard, currentColor) ? index : null
    ).filter(index => index !== null);
}

function initializeGame(room) {
    room.deck = createDeck();
    room.playerHands = [];
    
    room.players.forEach((player, index) => {
        if (player) {
            room.playerHands[index] = [];
        } else {
            room.playerHands[index] = null;
        }
    });
    
    for (let i = 0; i < 7; i++) {
        room.players.forEach((player, index) => {
            if (player && room.playerHands[index]) {
                room.playerHands[index].push(room.deck.pop());
            }
        });
    }
    
    let firstCard = room.deck.pop();
    while (firstCard.color === 'wild' || firstCard.value === 'skip' || 
           firstCard.value === 'reverse' || firstCard.value === '+2') {
        room.deck.unshift(firstCard);
        firstCard = room.deck.pop();
    }
    
    room.discardPile = [firstCard];
    room.currentColor = firstCard.color;
    
    let startPlayer = 0;
    while (!room.players[startPlayer]) {
        startPlayer = (startPlayer + 1) % room.maxPlayers;
    }
    room.currentPlayer = startPlayer;
    room.direction = 1;
    room.gameStarted = true;
    
    broadcastGameState(room);
}

function broadcastGameState(room) {
    room.players.forEach((player, index) => {
        if (player && player.socketId && room.playerHands[index]) {
            const topCard = room.discardPile[room.discardPile.length - 1];
            const playableCards = getPlayableCards(
                room.playerHands[index], 
                topCard, 
                room.currentColor
            );
            
            io.to(player.socketId).emit('gameState', {
                players: room.players.map((p, i) => p ? {
                    name: p.name,
                    cardCount: room.playerHands[i] ? room.playerHands[i].length : 0
                } : null),
                currentPlayer: room.currentPlayer,
                topCard: topCard,
                currentColor: room.currentColor,
                myHand: room.playerHands[index],
                playableCards: playableCards,
                direction: room.direction
            });
        }
    });
}

function handleSpecialCard(room, card) {
    const activePlayerCount = room.players.filter(p => p).length;
    
    if (card.value === 'skip') {
        nextPlayer(room);
    } else if (card.value === 'reverse') {
        if (activePlayerCount === 2) {
            nextPlayer(room);
        } else {
            room.direction *= -1;
        }
    } else if (card.value === '+2') {
        const nextPlayerIndex = getNextPlayerIndex(room);
        for (let i = 0; i < 2; i++) {
            if (room.deck.length > 0 && room.playerHands[nextPlayerIndex]) {
                room.playerHands[nextPlayerIndex].push(room.deck.pop());
            }
        }
        nextPlayer(room);
    } else if (card.value === 'wild+4') {
        const nextPlayerIndex = getNextPlayerIndex(room);
        for (let i = 0; i < 4; i++) {
            if (room.deck.length > 0 && room.playerHands[nextPlayerIndex]) {
                room.playerHands[nextPlayerIndex].push(room.deck.pop());
            }
        }
        nextPlayer(room);
    }
}

function getNextPlayerIndex(room) {
    let nextIndex = room.currentPlayer;
    let attempts = 0;
    const maxAttempts = room.maxPlayers;
    
    do {
        nextIndex = (nextIndex + room.direction + room.maxPlayers) % room.maxPlayers;
        attempts++;
        
        if (attempts > maxAttempts) {
            return room.currentPlayer;
        }
    } while (!room.players[nextIndex]);
    
    return nextIndex;
}

function nextPlayer(room) {
    room.currentPlayer = getNextPlayerIndex(room);
}

function checkWinner(room) {
    for (let i = 0; i < room.playerHands.length; i++) {
        const hand = room.playerHands[i];
        if (hand && hand.length === 0 && room.players[i]) {
            const winner = room.players[i];
            io.to(room.roomCode).emit('gameOver', {
                winnerId: i,
                winnerName: winner.name
            });
            return true;
        }
    }
    return false;
}

function broadcastRoomUpdate(room) {
    const activePlayers = room.players.filter(p => p);
    io.to(room.roomCode).emit('roomUpdate', {
        players: room.players,
        playerCount: activePlayers.length,
        maxPlayers: room.maxPlayers
    });
}

io.on('connection', (socket) => {
    console.log('Yeni bağlantı:', socket.id);

    socket.on('createRoom', (data) => {
        const roomCode = generateRoomCode();
        const maxPlayers = Math.min(Math.max(data.maxPlayers || 4, 2), 6);
        
        const room = {
            roomCode: roomCode,
            maxPlayers: maxPlayers,
            players: Array(maxPlayers).fill(null),
            deck: [],
            discardPile: [],
            playerHands: Array(maxPlayers).fill(null).map(() => []),
            currentPlayer: 0,
            currentColor: null,
            direction: 1,
            gameStarted: false,
            hostId: socket.id
        };
        
        room.players[0] = { name: data.playerName, socketId: socket.id };
        
        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.playerId = 0;
        
        socket.emit('roomCreated', {
            roomCode: roomCode,
            playerId: 0,
            maxPlayers: maxPlayers
        });
        
        broadcastRoomUpdate(room);
    });

    socket.on('joinRoom', (data) => {
        const room = rooms.get(data.roomCode);
        
        if (!room) {
            socket.emit('error', { message: 'Oda bulunamadı!' });
            return;
        }
        
        if (room.gameStarted) {
            socket.emit('error', { message: 'Oyun zaten başlamış!' });
            return;
        }
        
        const emptySlot = room.players.findIndex(p => p === null);
        
        if (emptySlot === -1) {
            socket.emit('error', { message: 'Oda dolu!' });
            return;
        }
        
        room.players[emptySlot] = {
            name: data.playerName,
            socketId: socket.id
        };
        
        socket.join(data.roomCode);
        socket.roomCode = data.roomCode;
        socket.playerId = emptySlot;
        
        socket.emit('roomJoined', {
            roomCode: data.roomCode,
            playerId: emptySlot
        });
        
        broadcastRoomUpdate(room);
        
        const activePlayers = room.players.filter(p => p);
        if (activePlayers.length === room.maxPlayers) {
            setTimeout(() => {
                io.to(data.roomCode).emit('gameStarted');
                initializeGame(room);
            }, 1000);
        }
    });

    socket.on('startGame', () => {
        const room = rooms.get(socket.roomCode);
        
        if (!room || room.hostId !== socket.id) return;
        
        const activePlayers = room.players.filter(p => p);
        if (activePlayers.length < 2) {
            socket.emit('error', { message: 'En az 2 oyuncu gerekli!' });
            return;
        }
        
        io.to(socket.roomCode).emit('gameStarted');
        initializeGame(room);
    });

    socket.on('playCard', (data) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentPlayer !== socket.playerId) return;
        
        if (!room.playerHands[socket.playerId] || data.cardIndex >= room.playerHands[socket.playerId].length) {
            socket.emit('error', { message: 'Geçersiz kart!' });
            return;
        }
        
        const card = room.playerHands[socket.playerId][data.cardIndex];
        const topCard = room.discardPile[room.discardPile.length - 1];
        
        if (!canPlayCard(card, topCard, room.currentColor)) {
            socket.emit('error', { message: 'Bu kartı oynayamazsınız!' });
            return;
        }
        
        room.playerHands[socket.playerId].splice(data.cardIndex, 1);
        room.discardPile.push(card);
        
        if (card.color !== 'wild') {
            room.currentColor = card.color;
        }
        
        handleSpecialCard(room, card);
        
        if (!checkWinner(room)) {
            if (card.value !== 'skip' && card.value !== 'reverse' && card.value !== '+2' && card.value !== 'wild+4') {
                nextPlayer(room);
            }
            broadcastGameState(room);
        }
    });

    socket.on('selectColor', (data) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentPlayer !== socket.playerId) return;
        
        if (!room.playerHands[socket.playerId] || data.cardIndex >= room.playerHands[socket.playerId].length) {
            socket.emit('error', { message: 'Geçersiz kart!' });
            return;
        }
        
        const card = room.playerHands[socket.playerId][data.cardIndex];
        
        if (card.color !== 'wild') return;
        
        room.playerHands[socket.playerId].splice(data.cardIndex, 1);
        room.discardPile.push(card);
        room.currentColor = data.color;
        
        handleSpecialCard(room, card);
        
        if (!checkWinner(room)) {
            if (card.value !== 'wild+4') {
                nextPlayer(room);
            }
            broadcastGameState(room);
        }
    });

    socket.on('drawCard', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentPlayer !== socket.playerId) return;
        
        if (!room.playerHands[socket.playerId]) return;
        
        if (room.deck.length === 0) {
            const topCard = room.discardPile.pop();
            room.deck = shuffleDeck(room.discardPile);
            room.discardPile = [topCard];
        }
        
        if (room.deck.length > 0) {
            const card = room.deck.pop();
            room.playerHands[socket.playerId].push(card);
        }
        
        broadcastGameState(room);
    });

    socket.on('passCard', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentPlayer !== socket.playerId) return;
        
        nextPlayer(room);
        broadcastGameState(room);
    });

    socket.on('callUno', () => {
        const room = rooms.get(socket.roomCode);
        if (!room) return;
        
        const hand = room.playerHands[socket.playerId];
        if (hand.length === 1) {
            io.to(socket.roomCode).emit('unoCall', {
                playerId: socket.playerId,
                playerName: room.players[socket.playerId].name
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('Bağlantı kesildi:', socket.id);
        
        if (socket.roomCode) {
            const room = rooms.get(socket.roomCode);
            if (room) {
                const player = room.players[socket.playerId];
                if (player) {
                    io.to(socket.roomCode).emit('playerDisconnected', {
                        playerId: socket.playerId,
                        playerName: player.name
                    });
                    
                    if (room.gameStarted) {
                        rooms.delete(socket.roomCode);
                    } else {
                        room.players[socket.playerId] = null;
                        broadcastRoomUpdate(room);
                    }
                }
            }
        }
    });
});

app.use(express.static('public'));

server.listen(PORT, () => {
    console.log(`Server çalışıyor: http://localhost:${PORT}`);
});
