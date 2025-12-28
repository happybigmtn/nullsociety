import { EventEmitter } from 'events';
import { type CasinoGameEvent } from '../codec/events.js';
export type { CasinoGameEvent } from '../codec/events.js';
/**
 * UpdatesFilter types matching backend
 */
export declare enum UpdatesFilterType {
    All = 0,
    Account = 1,
    Session = 2
}
/**
 * Encode an UpdatesFilter for the WebSocket URL
 */
export declare function encodeUpdatesFilter(filterType: UpdatesFilterType, data?: Uint8Array | bigint): string;
/**
 * WebSocket client for receiving backend updates
 */
export declare class UpdatesClient extends EventEmitter {
    private ws;
    private url;
    private origin;
    private reconnectDelay;
    private maxReconnectDelay;
    private shouldReconnect;
    private pendingEvents;
    constructor(baseUrl: string, origin?: string);
    /**
     * Connect to the updates stream for a specific account
     */
    connectForAccount(publicKey: Uint8Array): Promise<void>;
    /**
     * Connect to the updates stream for a specific game session
     */
    connectForSession(sessionId: bigint): Promise<void>;
    /**
     * Connect to the updates stream with a hex-encoded filter
     */
    private connect;
    /**
     * Handle incoming WebSocket message
     */
    private handleMessage;
    /**
     * Wait for a game event for a specific session
     */
    waitForEvent(sessionId: bigint, eventType: CasinoGameEvent['type'], timeoutMs?: number): Promise<CasinoGameEvent>;
    /**
     * Wait for ANY game event of a specific type (ignores session ID)
     * Use this when filtering by Account since a player has one game at a time
     */
    waitForAnyEvent(eventType: CasinoGameEvent['type'], timeoutMs?: number): Promise<CasinoGameEvent>;
    /**
     * Wait for 'started' OR 'error' event (game start or rejection)
     */
    waitForStartedOrError(timeoutMs?: number): Promise<CasinoGameEvent>;
    /**
     * Wait for ANY move, complete, or error event (for post-move waiting)
     * Error events are also matched since a move can be rejected
     */
    waitForMoveOrComplete(timeoutMs?: number): Promise<CasinoGameEvent>;
    /**
     * Schedule a reconnection attempt
     */
    private scheduleReconnect;
    /**
     * Disconnect from the updates stream
     */
    disconnect(): void;
    /**
     * Check if connected
     */
    isConnected(): boolean;
}
//# sourceMappingURL=updates.d.ts.map