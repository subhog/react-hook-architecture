import {Message, UserId, Uuid} from "./Model";
import * as io from "socket.io-client";
import Axios from "axios-observable"
import {map, retry} from "rxjs/operators";
import {Observable} from "rxjs";

interface MessagingService {

    /**
     * Socket methods
     */
    connect(): void

    disconnect(): void

    onConnect(block: () => void): void

    onNewMessage(block: (message: Message) => void): void

    onUserTyping(block: (userId: UserId, isTyping: boolean) => void): void

    sendMessage(message: Message): void

    sendUserTyping(userId: UserId, isTyping: boolean): void

    markMessagesAsRead(userId: UserId, lastReadMessageId: Uuid): void

    markMessageAsStarred(userId: UserId, messageId: Uuid): void

    /**
     * REST API methods
     */
    fetchMessagesBefore(userId: UserId, beforeMessageId?: Uuid): Observable<Array<Message>>

    fetchLastReadMessage(userId: UserId): Observable<Uuid>
}

class MessagingServiceImpl implements MessagingService {
    private socket: SocketIOClient.Socket | null = null;

    private readonly baseUrl = "http://localhost:5000/";

    fetchLastReadMessage(userId: number): Observable<Uuid> {
        const url = `${this.baseUrl}messages/lastRead?userId=${userId}`;
        return Axios
            .get(url)
            .pipe(
                retry(3), // do exponential backoff
                map((response) => response.data)
            );
    }

    fetchMessagesBefore(userId: number, beforeMessageId?: string): Observable<Array<Message>> {
        const root = `${this.baseUrl}messages?userId=${userId}`;
        const suffix = beforeMessageId ? `&uuid=${beforeMessageId}` : "";
        return Axios
            .get(root + suffix)
            .pipe(
                retry(3),
                map((response) => response.data)
            );
    }

    markMessageAsStarred(userId: number, messageId: string): void {
        this.emitOrThrow("message-starred", {userId: userId, messageIdToStar: messageId});
    }

    markMessagesAsRead(userId: number, lastReadMessageId: string): void {
        this.emitOrThrow("message-read", {userId: userId, messageId: lastReadMessageId});
    }

    connect(): void {
        this.socket = io.connect(this.baseUrl);
    }

    disconnect(): void {
        this.socket?.close();
    }

    onConnect(block: () => void): void {
        this.listenOrThrow("connect", block);
    }

    onNewMessage(block: (message: Message) => void): void {
        this.listenOrThrow("new-message", block)
    }

    onUserTyping(block: (userId: UserId, isTyping: boolean) => void): void {
        this.listenOrThrow("user-typing", ([id, typing]: [UserId, boolean]) => block(id, typing));
    }

    sendMessage(message: Message): void {
        this.emitOrThrow("new-message", message);
    }

    sendUserTyping(userId: number, isTyping: boolean): void {
        this.emitOrThrow("user-typing", [userId, isTyping]);
    }

    private listenOrThrow(tag: string, block: (payload?: any) => void): void {
        this.socket?.on(tag, block) || MessagingServiceImpl.socketNotInitialized(tag);
    }

    private emitOrThrow(tag: string, payload: any) {
        this.socket?.emit(tag, payload) || MessagingServiceImpl.socketNotInitialized(tag, payload);
    }

    private static socketNotInitialized(tag: string, payload?: any) {
        if (payload) {
            throw Error(`Cannot emit on ${tag} with payload ${JSON.stringify(payload)} because the 
                     socket is not initialized. You should connect to the socket first!`);
        } else {
            throw Error(`Cannot listen to ${tag} because the socket is not initialized. 
                     You should connect to the socket first!`);
        }
    }
}

export default new MessagingServiceImpl();