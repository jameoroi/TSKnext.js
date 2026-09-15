'use client';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';

// Emotion is part of the core UI stack next to Tailwind and Radix, so its SSR
// cache is mounted once at the root: `@emotion/styled` components and Material
// UI render with their styles flushed into the streamed HTML on every route.
// Public pages are answered from the edge cache (cloudflare/worker-entry.js),
// so the render cost is paid once per cache entry, not once per shopper.
// `enableCssLayer` places these styles in `@layer mui` (declared in
// globals.css) so Tailwind utilities still win.
const theme = createTheme({
  palette: {
    primary: { main: '#0b2e22' },
    success: { main: '#047857' },
    warning: { main: '#d97706' },
  },
  typography: { fontFamily: 'inherit' },
  shape: { borderRadius: 12 },
});

export function MuiProvider({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: 'mui', enableCssLayer: true }}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </AppRouterCacheProvider>
  );
}
