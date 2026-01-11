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
    room.playerHands = [[], []];
    
    for (let i = 0; i < 7; i++) {
        room.playerHands[0].push(room.deck.pop());
        room.playerHands[1].push(room.deck.pop());
    }
    
    let firstCard = room.deck.pop();
    while (firstCard.color === 'wild') {
        room.deck.unshift(firstCard);
        firstCard = room.deck.pop();
    }
    
    room.discardPile = [firstCard];
    room.currentColor = firstCard.color;
    room.currentPlayer = 0;
    room.gameStarted = true;
    
    broadcastGameState(room);
}

function broadcastGameState(room) {
    room.players.forEach((player, index) => {
        if (player.socketId) {
            const topCard = room.discardPile[room.discardPile.length - 1];
            const playableCards = getPlayableCards(
                room.playerHands[index], 
                topCard, 
                room.currentColor
            );
            
            io.to(player.socketId).emit('gameState', {
                players: room.players.map((p, i) => ({
                    name: p.name,
                    cardCount: room.playerHands[i].length
                })),
                currentPlayer: room.currentPlayer,
                topCard: topCard,
                currentColor: room.currentColor,
                myHand: room.playerHands[index],
                playableCards: playableCards
            });
        }
    });
}

function handleSpecialCard(room, card) {
    const opponent = room.currentPlayer === 0 ? 1 : 0;
    
    if (card.value === '+2') {
        for (let i = 0; i < 2; i++) {
            if (room.deck.length > 0) {
                room.playerHands[opponent].push(room.deck.pop());
            }
        }
    } else if (card.value === 'wild+4') {
        for (let i = 0; i < 4; i++) {
            if (room.deck.length > 0) {
                room.playerHands[opponent].push(room.deck.pop());
            }
        }
    }
}

function nextTurn(room) {
    const topCard = room.discardPile[room.discardPile.length - 1];
    
    if (topCard.value === 'skip' || topCard.value === 'reverse') {
        return;
    } else {
        room.currentPlayer = room.currentPlayer === 0 ? 1 : 0;
    }
}

function checkWinner(room) {
    const winnerIndex = room.playerHands.findIndex(hand => hand.length === 0);
    if (winnerIndex !== -1) {
        const winner = room.players[winnerIndex];
        io.to(room.roomCode).emit('gameOver', {
            winnerId: winnerIndex,
            winnerName: winner.name
        });
        return true;
    }
    return false;
}

io.on('connection', (socket) => {
    console.log('Yeni bağlantı:', socket.id);

    socket.on('createRoom', (data) => {
        const roomCode = generateRoomCode();
        const room = {
            roomCode: roomCode,
            players: [
                { name: data.playerName, socketId: socket.id },
                { name: null, socketId: null }
            ],
            deck: [],
            discardPile: [],
            playerHands: [[], []],
            currentPlayer: 0,
            currentColor: null,
            gameStarted: false
        };
        
        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.playerId = 0;
        
        socket.emit('roomCreated', {
            roomCode: roomCode,
            playerId: 0
        });
    });

    socket.on('joinRoom', (data) => {
        const room = rooms.get(data.roomCode);
        
        if (!room) {
            socket.emit('error', { message: 'Oda bulunamadı!' });
            return;
        }
        
        if (room.players[1].socketId) {
            socket.emit('error', { message: 'Oda dolu!' });
            return;
        }
        
        room.players[1] = {
            name: data.playerName,
            socketId: socket.id
        };
        
        socket.join(data.roomCode);
        socket.roomCode = data.roomCode;
        socket.playerId = 1;
        
        socket.emit('roomJoined', {
            roomCode: data.roomCode,
            playerId: 1
        });
        
        io.to(data.roomCode).emit('gameStarted');
        
        initializeGame(room);
    });

    socket.on('playCard', (data) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentPlayer !== socket.playerId) return;
        
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
            nextTurn(room);
            broadcastGameState(room);
        }
    });

    socket.on('selectColor', (data) => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentPlayer !== socket.playerId) return;
        
        const card = room.playerHands[socket.playerId][data.cardIndex];
        
        if (card.color !== 'wild') return;
        
        room.playerHands[socket.playerId].splice(data.cardIndex, 1);
        room.discardPile.push(card);
        room.currentColor = data.color;
        
        handleSpecialCard(room, card);
        
        if (!checkWinner(room)) {
            nextTurn(room);
            broadcastGameState(room);
        }
    });

    socket.on('drawCard', () => {
        const room = rooms.get(socket.roomCode);
        if (!room || room.currentPlayer !== socket.playerId) return;
        
        if (room.deck.length === 0) {
            const topCard = room.discardPile.pop();
            room.deck = shuffleDeck(room.discardPile);
            room.discardPile = [topCard];
        }
        
        const card = room.deck.pop();
        room.playerHands[socket.playerId].push(card);
        
        nextTurn(room);
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
                io.to(socket.roomCode).emit('playerDisconnected');
                rooms.delete(socket.roomCode);
            }
        }
    });
});

app.use(express.static('public'));

server.listen(PORT, () => {
    console.log(`Server çalışıyor: http://localhost:${PORT}`);
});
