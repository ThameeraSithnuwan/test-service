import { Socket } from "socket.io-client";
import { DefaultEventsMap } from "socket.io/dist/typed-events";


export class  SocketService {
    private static socket: Socket<DefaultEventsMap, DefaultEventsMap>;

    public static setSocket(socket: Socket<DefaultEventsMap, DefaultEventsMap>) {
        SocketService.socket = socket;
    }

    public static getSocket(): Socket<DefaultEventsMap, DefaultEventsMap> {
        return SocketService.socket;
    }

}