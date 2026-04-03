'use client';

import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import { collection, getDocs, query, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { Brain, Plus, Play } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Deck {
  id: string;
  name: string;
  description: string;
  cardCount: number;
}

interface DeckStats {
  dueCount: number;
  newCount: number;
}

export default function Home() {
  const { user, isAuthReady, signIn } = useAuth();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [stats, setStats] = useState<Record<string, DeckStats>>({});
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchDecks = async () => {
      try {
        const q = query(collection(db, 'decks'), where('ownerId', '==', user.uid));
        const snapshot = await getDocs(q);
        const fetchedDecks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Deck));
        setDecks(fetchedDecks);

        // Fetch stats for each deck
        const newStats: Record<string, DeckStats> = {};
        const now = new Date().toISOString();

        for (const deck of fetchedDecks) {
          // Fetch all cards for this deck
          const cardsQ = query(collection(db, 'cards'), where('deckId', '==', deck.id));
          const cardsSnap = await getDocs(cardsQ);
          const totalCards = cardsSnap.size;

          // Fetch all card states for this deck and user
          const statesQ = query(
            collection(db, 'card_states'), 
            where('deckId', '==', deck.id),
            where('userId', '==', user.uid)
          );
          const statesSnap = await getDocs(statesQ);
          
          let dueCount = 0;
          let reviewedCards = 0;

          statesSnap.forEach(doc => {
            reviewedCards++;
            const state = doc.data();
            if (state.nextReviewAt <= now) {
              dueCount++;
            }
          });

          const newCount = totalCards - reviewedCards;
          newStats[deck.id] = { dueCount, newCount };
        }

        setStats(newStats);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'decks');
      } finally {
        setLoading(false);
      }
    };

    fetchDecks();
  }, [user, isAuthReady]);

  const handleCreateDeck = async () => {
    if (!user) return;
    const name = prompt("Enter deck name:");
    if (!name) return;
    const description = prompt("Enter deck description (optional):") || "";

    setIsCreating(true);
    try {
      const newDeck = {
        name,
        description,
        ownerId: user.uid,
        createdAt: new Date().toISOString(),
        cardCount: 0,
      };
      const docRef = await addDoc(collection(db, 'decks'), newDeck);
      setDecks([...decks, { id: docRef.id, ...newDeck }]);
      setStats({ ...stats, [docRef.id]: { dueCount: 0, newCount: 0 } });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'decks');
    } finally {
      setIsCreating(false);
    }
  };

  if (!isAuthReady || loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-20 w-20 bg-neutral-900 rounded-2xl flex items-center justify-center shadow-xl">
              <Brain className="h-10 w-10 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-neutral-900">MetaSRS</h1>
          <p className="text-lg text-neutral-600">
            A neural memory scheduler spaced repetition app. Learn faster and remember longer.
          </p>
          <Button size="lg" onClick={signIn} className="w-full text-lg h-12">
            Sign in with Google
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900">Your Decks</h1>
            <p className="text-neutral-500 mt-1">Manage your flashcards and review sessions.</p>
          </div>
          <Button onClick={handleCreateDeck} disabled={isCreating}>
            <Plus className="mr-2 h-4 w-4" /> New Deck
          </Button>
        </div>

        {decks.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed border-neutral-200 rounded-xl bg-white">
            <Brain className="mx-auto h-12 w-12 text-neutral-300 mb-4" />
            <h3 className="text-lg font-medium text-neutral-900">No decks yet</h3>
            <p className="text-neutral-500 mt-1 mb-4">Create your first deck to start learning.</p>
            <Button onClick={handleCreateDeck} variant="outline">
              Create Deck
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {decks.map((deck) => {
              const deckStats = stats[deck.id] || { dueCount: 0, newCount: 0 };
              const totalToReview = deckStats.dueCount + deckStats.newCount;

              return (
                <Card key={deck.id} className="flex flex-col">
                  <CardHeader>
                    <CardTitle className="text-xl">{deck.name}</CardTitle>
                    <CardDescription className="line-clamp-2">{deck.description || "No description"}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="flex gap-4 text-sm">
                      <div className="flex flex-col">
                        <span className="text-neutral-500">Cards</span>
                        <span className="font-medium">{deck.cardCount}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-neutral-500">New</span>
                        <span className="font-medium text-blue-600">{deckStats.newCount}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-neutral-500">Due</span>
                        <span className="font-medium text-red-600">{deckStats.dueCount}</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex gap-2">
                    <Button asChild variant="outline" className="flex-1">
                      <Link href={`/decks/${deck.id}`}>Manage</Link>
                    </Button>
                    <Button asChild className="flex-1" disabled={totalToReview === 0}>
                      <Link href={totalToReview > 0 ? `/review/${deck.id}` : '#'}>
                        <Play className="mr-2 h-4 w-4" /> Review
                      </Link>
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
