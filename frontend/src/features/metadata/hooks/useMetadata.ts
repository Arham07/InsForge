import { useQuery } from '@tanstack/react-query';
import { metadataService } from '../services/metadata.service';

interface UseMetadataOptions {
  enabled?: boolean;
  staleTime?: number;
}

export function useMetadata(options?: UseMetadataOptions) {
  const {
    data: metadata,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['metadata', 'full'],
    queryFn: () => metadataService.getFullMetadata(),
    staleTime: options?.staleTime ?? 5 * 60 * 1000, // Cache for 5 minutes by default
    enabled: options?.enabled ?? true,
  });

  return {
    metadata,
    auth: metadata?.auth,
    tables: Object.keys(metadata?.database.tables ?? {}),
    storage: metadata?.storage,
    version: metadata?.version || 'Unknown',
    isLoading,
    error,
    refetch,
  };
}

export function useApiKey(options?: UseMetadataOptions) {
  const {
    data: apiKey,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['metadata', 'apiKey'],
    queryFn: () => metadataService.fetchApiKey(),
    staleTime: options?.staleTime ?? 10 * 60 * 1000, // Cache for 10 minutes by default
    enabled: options?.enabled ?? true,
  });

  return {
    apiKey,
    isLoading,
    error,
    refetch,
  };
}
