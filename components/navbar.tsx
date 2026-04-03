'use client';

import Link from 'next/link';
import { useAuth } from './auth-provider';
import { Button } from './ui/button';
import { Brain, LogOut } from 'lucide-react';

export function Navbar() {
  const { user, isAuthReady, signOut } = useAuth();

  if (!isAuthReady || !user) return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-200 bg-white/80 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="bg-neutral-900 p-1.5 rounded-lg">
            <Brain className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-neutral-900">MetaSRS</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-neutral-600 hidden sm:inline-block">
            {user.email}
          </span>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-neutral-600 hover:text-neutral-900">
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>
    </header>
  );
}
