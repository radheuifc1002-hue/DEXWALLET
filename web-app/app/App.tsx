import { RouterProvider } from 'react-router';
import { router } from './routes';
import { WalletProvider } from './context/WalletContext';

export default function App() {
  return (
    <WalletProvider>
      <div className="min-h-screen bg-background max-w-md mx-auto relative">
        <RouterProvider router={router} />
      </div>
    </WalletProvider>
  );
}