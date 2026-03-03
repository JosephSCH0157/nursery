declare module 'ws' {
	import type { IncomingMessage } from 'node:http';
	import type { Socket } from 'node:net';

	export type MessageData = string | Buffer | ArrayBuffer | Buffer[];

	export interface WebSocket {
		send(data: string | Buffer): void;
		close(code?: number, data?: string): void;
		on(event: 'message', listener: (data: MessageData) => void): this;
		on(event: 'close' | 'error', listener: () => void): this;
	}

	export interface WebSocketServerOptions {
		noServer?: boolean;
	}

	export class WebSocketServer {
		constructor(options?: WebSocketServerOptions);
		handleUpgrade(
			req: IncomingMessage,
			socket: Socket,
			head: Buffer,
			cb: (ws: WebSocket) => void,
		): void;
	}
}
