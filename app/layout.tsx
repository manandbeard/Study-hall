import type {Metadata} from 'next';
import './globals.css';
import { AuthProvider } from '@/components/auth-provider';
import { Navbar } from '@/components/navbar';

export const metadata: Metadata = {
  title: 'MetaSRS Spaced Repetition',
  description: 'A neural memory scheduler spaced repetition app.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className="bg-neutral-50 text-neutral-900 min-h-screen flex flex-col">
        <AuthProvider>
          <Navbar />
          <div className="flex-1">
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
