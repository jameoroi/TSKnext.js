'use client';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';

// Material UI is scoped to the back office: Emotion renders styles at request
// time, and the storefront already runs close to the Workers CPU budget, so
// shoppers get Radix + Tailwind only. `enableCssLayer` places MUI's styles in
// `@layer mui` (declared in globals.css) so Tailwind utilities still win.
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
