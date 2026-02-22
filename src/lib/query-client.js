import { QueryClient } from '@tanstack/react-query';


export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
				retry: 2, // 2回リトライ（合計3回試行）
				retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 3000), // 500ms, 1s, 2s max 3s
			staleTime: 5 * 60 * 1000, // 5分間はキャッシュを新鮮とみなす
			gcTime: 15 * 60 * 1000, // 15分間キャッシュを保持
			refetchOnMount: true, // staleTime内はキャッシュを使用、stale時のみrefetch
		},
	},
});
