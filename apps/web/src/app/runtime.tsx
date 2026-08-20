import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { AppProviders } from './app-providers.js';
import { AppRoutes } from './routes.js';

export function RuntimeApp(): React.JSX.Element {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AppProviders>
          <AppRoutes />
        </AppProviders>
      </BrowserRouter>
    </MotionConfig>
  );
}
