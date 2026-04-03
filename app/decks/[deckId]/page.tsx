'use client';

import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where, addDoc, updateDoc, increment } from 'firebase/firestore';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Deck {
  id: string;
  name: string;
  description: string;
  cardCount: number;
}

interface Flashcard {
  id: string;
  front: string;
  back: string;
  createdAt: string;
}

export default function DeckPage() {
  const { deckId } = useParams() as { deckId: string };
  const { user, isAuthReady } = useAuth();
  const router = useRouter();

  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  const [front, setFront] = useState('');
  const [back, setBack] = useState('');

  useEffect(() => {
    if (!isAuthReady) return;
    if (!user) {
      router.push('/');
      return;
    }

    const fetchDeckAndCards = async () => {
      try {
        const deckRef = doc(db, 'decks', deckId);
        const deckSnap = await getDoc(deckRef);
        
        if (!deckSnap.exists() || deckSnap.data().ownerId !== user.uid) {
          router.push('/');
          return;
        }
        
        setDeck({ id: deckSnap.id, ...deckSnap.data() } as Deck);

        const cardsQ = query(collection(db, 'cards'), where('deckId', '==', deckId));
        const cardsSnap = await getDocs(cardsQ);
        const fetchedCards = cardsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Flashcard));
        
        // Sort by createdAt descending
        fetchedCards.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setCards(fetchedCards);
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `decks/${deckId}`);
      } finally {
        setLoading(false);
      }
    };

    fetchDeckAndCards();
  }, [deckId, user, isAuthReady, router]);

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !deck || !front.trim() || !back.trim()) return;

    setIsAdding(true);
    try {
      const newCard = {
        deckId,
        front: front.trim(),
        back: back.trim(),
        ownerId: user.uid,
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'cards'), newCard);
      setCards([{ id: docRef.id, ...newCard }, ...cards]);
      
      // Update deck card count
      await updateDoc(doc(db, 'decks', deckId), {
        cardCount: increment(1)
      });
      setDeck({ ...deck, cardCount: deck.cardCount + 1 });

      setFront('');
      setBack('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'cards');
    } finally {
      setIsAdding(false);
    }
  };

  if (!isAuthReady || loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!deck) return null;

  return (
    <main className="min-h-screen bg-neutral-50 p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900">{deck.name}</h1>
            <p className="text-neutral-500 mt-1">{deck.description || "No description"}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Add New Card</CardTitle>
                <CardDescription>Create a new flashcard for this deck.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleAddCard} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="front">Front (Question)</Label>
                    <Textarea 
                      id="front" 
                      value={front} 
                      onChange={(e) => setFront(e.target.value)} 
                      placeholder="e.g. What is the capital of France?"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="back">Back (Answer)</Label>
                    <Textarea 
                      id="back" 
                      value={back} 
                      onChange={(e) => setBack(e.target.value)} 
                      placeholder="e.g. Paris"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isAdding || !front.trim() || !back.trim()}>
                    {isAdding ? 'Adding...' : 'Add Card'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-2 space-y-4">
            <h2 className="text-xl font-semibold text-neutral-900 flex items-center justify-between">
              Cards in Deck
              <span className="text-sm font-normal text-neutral-500 bg-neutral-200 px-2 py-1 rounded-full">
                {deck.cardCount} total
              </span>
            </h2>
            
            {cards.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-neutral-200 rounded-xl bg-white">
                <p className="text-neutral-500">No cards yet. Add your first card to the left.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {cards.map((card) => (
                  <Card key={card.id}>
                    <CardContent className="p-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Front</p>
                          <p className="text-neutral-900 whitespace-pre-wrap">{card.front}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Back</p>
                          <p className="text-neutral-900 whitespace-pre-wrap">{card.back}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
