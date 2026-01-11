const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const rooms = {}; // roomCode: gameState

io.on("connection", socket => {

  socket.on("joinRoom", ({ roomCode, playerName }) => {
    socket.join(roomCode);

    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        players: [],
        gameState: null
      };
    }

    rooms[roomCode].players.push({
      id: socket.id,
      name: playerName
    });

    io.to(roomCode).emit("roomUpdate", rooms[roomCode]);
  });

  socket.on("gameAction", ({ roomCode, action }) => {
    // action: kart oyna, kart çek vs.
    // gameState burada güncellenir
    io.to(roomCode).emit("stateUpdate", rooms[roomCode].gameState);
  });

  socket.on("disconnect", () => {
    // oyuncu çıkışı temizle
  });
});

server.listen(3000, () => console.log("Server 3000"));
