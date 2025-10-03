import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect } from 'react';
import { useMetadata } from '@/features/metadata/hooks/useMetadata';
import { useUsers } from '@/features/auth/hooks/useUsers';
import { SchemaVisualizer, VisualizerSkeleton } from '../components';
import { Button } from '@/components/radix/Button';
import { Alert, AlertDescription } from '@/components/radix/Alert';
import {
  useSocket,
  ServerEvents,
  DataUpdatePayload,
  DataUpdateResourceType,
  SocketMessage,
} from '@/lib/contexts/SocketContext';

const VisualizerPage = () => {
  const { socket, isConnected } = useSocket();
  const queryClient = useQueryClient();

  const {
    metadata,
    isLoading: metadataLoading,
    error: metadataError,
    refetch: refetchMetadata,
  } = useMetadata();

  const {
    totalUsers,
    isLoading: userStatsLoading,
    refetch: refetchUserStats,
  } = useUsers({ enabled: true });

  const isLoading = metadataLoading || userStatsLoading;
  const error = metadataError;

  const handleRefresh = useCallback(() => {
    void refetchMetadata();
    void refetchUserStats();
  }, [refetchMetadata, refetchUserStats]);

  // Listen for schema change events
  useEffect(() => {
    if (!socket || !isConnected) {
      return;
    }

    const handleDataUpdate = (message: SocketMessage<DataUpdatePayload>) => {
      if (
        message.payload?.resource === DataUpdateResourceType.METADATA ||
        message.payload?.resource === DataUpdateResourceType.DATABASE_SCHEMA ||
        message.payload?.resource === DataUpdateResourceType.TABLE_SCHEMA ||
        message.payload?.resource === DataUpdateResourceType.OAUTH_SCHEMA ||
        message.payload?.resource === DataUpdateResourceType.STORAGE_SCHEMA
      ) {
        // Invalidate all metadata-related queries
        void queryClient.invalidateQueries({ queryKey: ['metadata'] });
      }
    };

    socket.on(ServerEvents.DATA_UPDATE, handleDataUpdate);

    return () => {
      socket.off(ServerEvents.DATA_UPDATE, handleDataUpdate);
    };
  }, [socket, isConnected, queryClient]);

  if (isLoading) {
    return <VisualizerSkeleton />;
  }

  if (!metadata || error) {
    return (
      <div className="relative min-h-screen bg-neutral-800 overflow-hidden">
        {/* Dot Matrix Background */}
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage: `radial-gradient(circle, #3B3B3B 1px, transparent 1px)`,
            backgroundSize: '12px 12px',
          }}
        />

        <div className="relative z-10 flex items-center justify-center min-h-screen p-8">
          <Alert variant="destructive" className="max-w-md">
            <AlertDescription>
              Failed to load database schema. Please ensure the backend is running and try
              refreshing.
            </AlertDescription>
            <Button onClick={handleRefresh} className="mt-4 w-full" variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-neutral-800 overflow-hidden">
      {/* Dot Matrix Background */}
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage: `radial-gradient(circle, #3B3B3B 1px, transparent 1px)`,
          backgroundSize: '12px 12px',
        }}
      />

      {/* Schema Visualizer */}
      <div className="relative z-10 w-full h-screen">
        <SchemaVisualizer metadata={metadata} userCount={totalUsers} />
      </div>
    </div>
  );
};

export default VisualizerPage;
