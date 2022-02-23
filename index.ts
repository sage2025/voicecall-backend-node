import { Server as SocketServer, Socket } from "socket.io";
import { createServer, Server as HttpServer} from "http";
import express, { Express } from "express";
import { PeerServer } from "peer";
import path from "path";

const httpPort: number | string = process.env.PORT || 8080;
const peerPort: number = 443;

const app: Express = express();

const httpServer: HttpServer = createServer(app);
const peerServer = PeerServer({ port: 443, path: "/rtc" })

const io = new SocketServer(httpServer, {
  cors: {
    origin: "*",
  },
});

let connections: Connection[] = [
    { room: "GLOBAL", peers: [] }
];

let messages: MsgList[] = [
    { roomId: "GLOBAL", messages: [] }
];


app.use(express.static(path.join(path.resolve("../"), "client", "build")));

app.get("/", ( req, res ) => {
    res.sendFile(path.join(path.resolve("../"), "client", "build", "index.html"));
});

app.get("/api/rooms", ( req, res ) => res.send({ connections }));

app.get("/api/chat/:roomId", ( req, res ) => {
    const roomId: string = req.params.roomId;

    const msgList: MsgList | undefined = messages.find(( msg: MsgList ) => msg.roomId === roomId );
    res.send(msgList);
})

io.on("connection", ( socket: Socket ) => {
    const leaveFromRoom = ({ id, peer }: { id: string, peer: string | undefined }) => {
        const connection: Connection | undefined = connections.find(( conn: Connection ) => conn.room === id );
        const index: number | undefined = connection ? connections.indexOf(connection) : undefined;

        if(connection && index !== undefined){
            connection.peers = connection?.peers.filter(( peerClient: Name ) => peerClient.id !== peer);
            connections[index] = connection;
        }

        io.to(id).emit("leftFromRoom", { id, peer });
    }

    socket.on("joinToRoom", ({ id, peer, name, color }) => {
        socket.join(id);

        const connection: Connection | undefined = connections.find(( conn: Connection ) => conn.room === id );
        
        if(connection && !connection.peers.find(( peerClient: Name ) => peerClient.id === peer)){
            const index: number = connections.indexOf(connection);
            connections[index].peers = [ ...connections[index].peers, { name, id: peer, color } ];
            
            io.to(id).emit("onJoinToRoom", connections[index]);
            return;
        }

        const newConnection: Connection = { room: id, peers: [ peer, name ] };
        connections = [ ...connections, newConnection ];

        io.to(id).emit("onJoinToRoom", newConnection);
    });

    socket.on("leaveFromRoom", ({ id, peer }) => {
        leaveFromRoom({ id, peer });
        console.log(id, peer);
    });

    socket.on("createRoom", ({ id, peer }) => {
        const connection: Connection | undefined = connections.find(( conn: Connection ) => conn.room === id );
        const userPeer: Connection | undefined = 
            connections.find(( conn: Connection ) => conn.peers.find(( peerClient: Name ) => peerClient.id === peer));

        if(connection || userPeer) return;

        connections = [ ...connections, { room: id, peers: [ ] } ];
        messages = [ ...messages, { roomId: id, messages: [] } ];
    })

    socket.on("sendMessage", ({ name, message, roomId }: MsgData ) => {
        const msglist: MsgList | undefined = messages.find(( msg: MsgList ) => msg.roomId === roomId );

        if(!msglist) return;
        msglist.messages = [ ...msglist.messages, {  roomId, name, message } ]

        io.to(roomId).emit("messageSent", { name, message, roomId });
    })
    
    peerServer.on("disconnect", ( client ) => {
        const peer = client.getId();
        const userConnection: Connection | undefined = 
            connections.find(( conn: Connection ) => conn.peers.find(( peerClient: Name ) => peerClient.id === peer));
        
        userConnection && leaveFromRoom({ id: userConnection?.room, peer });
    })
})

interface Connection {
    room: string,
    peers: Name[],
}

interface Name {
    name: string,
    id: string,
    color: string
}

interface MsgData { 
    name: string, 
    message: string,
    roomId: string
};

interface MsgList {
    roomId: string,
    messages: MsgData[]
}

httpServer.listen(httpPort, () => console.log(`HTTP-SERVER > Listening on http://localhost:${httpPort}`));
