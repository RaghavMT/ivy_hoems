import { createBrowserRouter, Navigate } from 'react-router-dom';
import { App } from './App';
import { LoginPage } from './auth/LoginPage';
import { RequireAuth } from './auth/RequireAuth';
import { RouteError } from './components/RouteError';
import { NotFound } from './components/NotFound';
import { ListingDetailPage } from './listings/ListingDetailPage';
import { ListingsPage } from './listings/ListingsPage';
import { RentalDetailPage } from './rentals/RentalDetailPage';
import { RentalsPage } from './rentals/RentalsPage';
import { ProjectsPage } from './projects/ProjectsPage';
import { SavedPage } from './saved/SavedPage';
import { InsightsPage } from './insights/InsightsPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteError /> },
  {
    path: '/',
    element: <App />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/listings" replace /> },
      // Built from committed analysis output, so it needs no API session.
      { path: 'insights', element: <InsightsPage /> },
      {
        // Every data endpoint needs a logged-in user's token (H-029).
        element: <RequireAuth />,
        children: [
          { path: 'listings', element: <ListingsPage /> },
          { path: 'listings/:id', element: <ListingDetailPage /> },
          { path: 'rentals', element: <RentalsPage /> },
          { path: 'rentals/:id', element: <RentalDetailPage /> },
          { path: 'projects', element: <ProjectsPage /> },
          { path: 'saved', element: <SavedPage /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
