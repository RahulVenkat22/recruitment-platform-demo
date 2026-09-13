import { AuthBootstrap } from '@/app/AuthBootstrap'
import { AppProviders } from '@/app/providers'
import { RouteErrorBoundary } from '@/app/RouteErrorBoundary'
import { AppRoutes } from '@/app/router'

export default function App() {
  return (
    <AppProviders>
      <AuthBootstrap>
        <RouteErrorBoundary title="Aimious couldn't start">
          <AppRoutes />
        </RouteErrorBoundary>
      </AuthBootstrap>
    </AppProviders>
  )
}
