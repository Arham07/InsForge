import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
  useMemo,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { apiClient } from '@/lib/api/client';
import { useAuth } from '@/lib/contexts/AuthContext';

// ============================================================================
// Types & Enums
// ============================================================================

/**
 * Server-to-client event types
 */
export enum ServerEvents {
  NOTIFICATION = 'notification',
  DATA_UPDATE = 'data:update',
  MCP_CONNECTED = 'mcp:connected',
}

/**
 * Client-to-server event types
 */
export enum ClientEvents {
  SUBSCRIBE = 'subscribe',
  UNSUBSCRIBE = 'unsubscribe',
}

/**
 * Base message structure for all socket communications
 */
export interface SocketMessage<T = unknown> {
  type: string;
  payload?: T;
  timestamp: number;
  id?: string;
}

// ============================================================================
// Payload Types
// ============================================================================

export interface NotificationPayload {
  level: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
}

export enum DataUpdateResourceType {
  METADATA = 'metadata',
  DATABASE_SCHEMA = 'database_schema',
  TABLE_SCHEMA = 'table_schema',
  STORAGE_SCHEMA = 'storage_schema',
  BUCKET_SCHEMA = 'bucket_schema',
  OAUTH_SCHEMA = 'oauth_shcmea',
}

export interface DataUpdatePayload {
  resource: DataUpdateResourceType;
  action: 'created' | 'updated' | 'deleted';
  data: unknown;
}

// ============================================================================
// Context Types
// ============================================================================

interface SocketState {
  isConnected: boolean;
  connectionError: string | null;
  socketId: string | null;
  mcpConnected: boolean;
}

interface SocketActions {
  connect: (token: string | null) => void;
  disconnect: () => void;
  subscribe: (channel: string, filters?: Record<string, unknown>) => void;
  unsubscribe: (channel: string) => void;
  emit: (event: ClientEvents, data?: unknown) => void;
}

interface SocketContextValue extends SocketState, SocketActions {
  socket: Socket | null;
}

// ============================================================================
// Context & Provider
// ============================================================================

const SocketContext = createContext<SocketContextValue | null>(null);

interface SocketProviderProps {
  children: ReactNode;
}

/**
 * Socket.IO Provider - Manages WebSocket connection for the entire application
 */
export function SocketProvider({ children }: SocketProviderProps) {
  // Get authentication state
  const { isAuthenticated } = useAuth();
  // State
  const [state, setState] = useState<SocketState>({
    isConnected: false,
    connectionError: null,
    socketId: null,
    mcpConnected: false,
  });

  // Refs
  const socketRef = useRef<Socket | null>(null);
  const subscriptionsRef = useRef<Set<string>>(new Set());

  /**
   * Update state helper
   */
  const updateState = useCallback((updates: Partial<SocketState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  /**
   * Create and configure socket connection
   */
  const createSocket = useCallback(
    (token: string): Socket => {
      const socket = io(import.meta.env.VITE_API_BASE_URL || 'http://localhost:7130', {
        auth: {
          token,
        },
      });

      // Core connection events
      socket.on('connect', () => {
        updateState({
          isConnected: true,
          connectionError: null,
          socketId: socket.id || null,
        });
      });

      socket.on('disconnect', (reason) => {
        updateState({
          isConnected: false,
          socketId: null,
          connectionError: `Disconnected: ${reason}`,
        });
      });

      socket.on('connect_error', (error) => {
        updateState({
          connectionError: `Connection failed: ${error.message}`,
          isConnected: false,
        });
      });

      socket.on('error', (error) => {
        updateState({ connectionError: error?.message || 'Unknown error' });
      });

      socket.on('reconnect', () => {
        updateState({
          isConnected: true,
          connectionError: null,
        });

        // Re-subscribe to channels after reconnection
        subscriptionsRef.current.forEach((channel) => {
          socket.emit(ClientEvents.SUBSCRIBE, { channel });
        });
      });

      return socket;
    },
    [updateState]
  );

  /**
   * Connect to socket server
   */
  const connect = useCallback(
    (token: string | null) => {
      // Don't connect without a token
      if (!token) {
        return;
      }

      // Don't reconnect if already connected with the same token
      if (socketRef.current?.connected) {
        return;
      }

      try {
        const socket = createSocket(token);
        socketRef.current = socket;
      } catch (error) {
        console.error('Socket connection error:', error);
        updateState({ connectionError: 'Failed to establish connection' });
      }
    },
    [createSocket, updateState]
  );

  /**
   * Disconnect from socket server
   */
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    updateState({
      isConnected: false,
      connectionError: null,
      socketId: null,
    });

    subscriptionsRef.current.clear();
  }, [updateState]);

  /**
   * Subscribe to a channel
   */
  const subscribe = useCallback((channel: string, filters?: Record<string, unknown>) => {
    if (!socketRef.current?.connected) {
      return;
    }

    socketRef.current.emit(ClientEvents.SUBSCRIBE, { channel, filters });
    subscriptionsRef.current.add(channel);
  }, []);

  /**
   * Unsubscribe from a channel
   */
  const unsubscribe = useCallback((channel: string) => {
    if (!socketRef.current?.connected) {
      return;
    }

    socketRef.current.emit(ClientEvents.UNSUBSCRIBE, { channel });
    subscriptionsRef.current.delete(channel);
  }, []);

  /**
   * Emit event to server
   */
  const emit = useCallback((event: ClientEvents, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  // Monitor authentication state and token changes
  useEffect(() => {
    const token = apiClient.getToken();

    if (isAuthenticated && token) {
      // Connect when authenticated with a valid token
      connect(token);
    } else {
      // Disconnect when not authenticated or no token
      disconnect();
    }
  }, [isAuthenticated, connect, disconnect]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Context value
  const contextValue = useMemo<SocketContextValue>(
    () => ({
      // State
      socket: socketRef.current,
      ...state,
      // Actions
      connect,
      disconnect,
      subscribe,
      unsubscribe,
      emit,
    }),
    [state, connect, disconnect, subscribe, unsubscribe, emit]
  );

  return <SocketContext.Provider value={contextValue}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocketContext must be used within a SocketProvider');
  }
  return context;
}
