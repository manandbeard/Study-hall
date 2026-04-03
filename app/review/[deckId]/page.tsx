'use client';

import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import { initialDifficulty, initialStability, step } from '@/lib/fsrs';
import { collection, doc, getDoc, getDocs, query, where, setDoc, addDoc } from 'firebase/firestore';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Flashcard {
  id: string;
  front: string;
  back: string;
}

interface CardState {
  id?: string;
  userId: string;
  cardId: string;
  deckId: string;
  S: number;
  D: number;
  R: number;
  lastReviewedAt: string;
  nextReviewAt: string;
  reviewCount: number;
}

export default function ReviewPage() {
  const { deckId } = useParams() as { deckId: string };
  const { user, isAuthReady } = useAuth();
  const router = useRouter();

  const [deckName, setDeckName] = useState('');
  const [dueCards, setDueCards] = useState<{ card: Flashcard; state: CardState | null }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isFinished, setIsFinished] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!user) {
      router.push('/');
      return;
    }

    const fetchReviewData = async () => {
      try {
        const deckRef = doc(db, 'decks', deckId);
        const deckSnap = await getDoc(deckRef);
        if (!deckSnap.exists() || deckSnap.data().ownerId !== user.uid) {
          router.push('/');
          return;
        }
        setDeckName(deckSnap.data().name);

        const cardsQ = query(collection(db, 'cards'), where('deckId', '==', deckId));
        const cardsSnap = await getDocs(cardsQ);
        const allCards = cardsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Flashcard));

        const statesQ = query(
          collection(db, 'card_states'),
          where('deckId', '==', deckId),
          where('userId', '==', user.uid)
        );
        const statesSnap = await getDocs(statesQ);
        const statesMap = new Map<string, CardState>();
        statesSnap.forEach(doc => {
          const data = doc.data() as CardState;
          statesMap.set(data.cardId, { id: doc.id, ...data });
        });

        const now = new Date().toISOString();
        const cardsToReview: { card: Flashcard; state: CardState | null }[] = [];

        for (const card of allCards) {
          const state = statesMap.get(card.id) || null;
          if (!state || state.nextReviewAt <= now) {
            cardsToReview.push({ card, state });
          }
        }

        // Shuffle due cards
        for (let i = cardsToReview.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [cardsToReview[i], cardsToReview[j]] = [cardsToReview[j], cardsToReview[i]];
        }

        setDueCards(cardsToReview);
        if (cardsToReview.length === 0) {
          setIsFinished(true);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `review/${deckId}`);
      } finally {
        setLoading(false);
      }
    };

    fetchReviewData();
  }, [deckId, user, isAuthReady, router]);

  const handleGrade = async (grade: number) => {
    if (!user || isSubmitting) return;
    setIsSubmitting(true);

    const currentItem = dueCards[currentIndex];
    const { card, state } = currentItem;
    const now = new Date();
    const nowIso = now.toISOString();

    let S_next, D_next, R_next;
    let elapsedDays = 0;

    if (!state) {
      // First review
      S_next = initialStability(grade);
      D_next = initialDifficulty(grade);
      R_next = 1.0;
    } else {
      const lastReviewDate = new Date(state.lastReviewedAt);
      elapsedDays = Math.max(0, (now.getTime() - lastReviewDate.getTime()) / (1000 * 60 * 60 * 24));
      
      const result = step(state.S, state.D, elapsedDays, grade);
      S_next = result.S_next;
      D_next = result.D_next;
      R_next = result.R;
    }

    // Calculate next review date based on Stability (S is roughly interval in days for 90% retention)
    // Add a small fuzz factor (0.95 to 1.05) to prevent clustering
    const fuzz = 0.95 + Math.random() * 0.1;
    let intervalDays = Math.max(1, Math.round(S_next * fuzz));
    
    // If grade is 1 (Again), review very soon (e.g., 1 day or less, but we'll stick to 1 day minimum for simplicity)
    if (grade === 1) intervalDays = 1;

    const nextReviewDate = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

    const newState: CardState = {
      userId: user.uid,
      cardId: card.id,
      deckId,
      S: S_next,
      D: D_next,
      R: R_next,
      lastReviewedAt: nowIso,
      nextReviewAt: nextReviewDate.toISOString(),
      reviewCount: (state?.reviewCount || 0) + 1,
    };

    try {
      // Save Card State
      const stateId = `${user.uid}_${card.id}`;
      await setDoc(doc(db, 'card_states', stateId), newState);

      // Save Review Log
      await addDoc(collection(db, 'reviews'), {
        userId: user.uid,
        cardId: card.id,
        deckId,
        reviewedAt: nowIso,
        elapsedDays,
        grade,
        recalled: grade >= 2,
      });

      // Move to next card
      if (currentIndex + 1 < dueCards.length) {
        setCurrentIndex(currentIndex + 1);
        setShowAnswer(false);
      } else {
        setIsFinished(true);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'card_states');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isAuthReady || loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (isFinished) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-24 w-24 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-900">You&apos;re all caught up!</h1>
          <p className="text-lg text-neutral-600">
            You&apos;ve reviewed all due cards in <strong>{deckName}</strong>.
          </p>
          <Button size="lg" asChild className="w-full">
            <Link href="/">Return to Dashboard</Link>
          </Button>
        </div>
      </main>
    );
  }

  const currentItem = dueCards[currentIndex];
  const progress = ((currentIndex) / dueCards.length) * 100;

  return (
    <main className="min-h-screen bg-neutral-50 p-4 md:p-8 flex flex-col">
      <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="text-center flex-1">
            <h1 className="text-xl font-semibold text-neutral-900">{deckName}</h1>
            <p className="text-sm text-neutral-500">
              Card {currentIndex + 1} of {dueCards.length}
            </p>
          </div>
          <div className="w-10" /> {/* Spacer for alignment */}
        </div>

        {/* Progress bar */}
        <div className="w-full bg-neutral-200 h-2 rounded-full mb-8 overflow-hidden">
          <div 
            className="bg-neutral-900 h-full transition-all duration-300 ease-in-out" 
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex-1 flex flex-col justify-center items-center w-full max-w-2xl mx-auto">
          <Card className="w-full min-h-[300px] flex flex-col shadow-lg border-neutral-200">
            <CardContent className="flex-1 flex flex-col items-center justify-center p-8 md:p-12 text-center">
              <div className="w-full">
                <p className="text-sm font-medium text-neutral-400 uppercase tracking-widest mb-6">Question</p>
                <h2 className="text-2xl md:text-4xl font-medium text-neutral-900 leading-relaxed whitespace-pre-wrap">
                  {currentItem.card.front}
                </h2>
              </div>

              {showAnswer && (
                <div className="w-full mt-12 pt-12 border-t border-neutral-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <p className="text-sm font-medium text-neutral-400 uppercase tracking-widest mb-6">Answer</p>
                  <h2 className="text-2xl md:text-3xl font-medium text-neutral-800 leading-relaxed whitespace-pre-wrap">
                    {currentItem.card.back}
                  </h2>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 mb-4 max-w-2xl mx-auto w-full">
          {!showAnswer ? (
            <Button 
              size="lg" 
              className="w-full h-16 text-lg shadow-md" 
              onClick={() => setShowAnswer(true)}
            >
              Show Answer
            </Button>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button 
                variant="outline" 
                className="h-16 flex flex-col gap-1 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                onClick={() => handleGrade(1)}
                disabled={isSubmitting}
              >
                <span className="font-semibold">Again</span>
                <span className="text-xs opacity-70">&lt; 1m</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-16 flex flex-col gap-1 border-orange-200 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-300"
                onClick={() => handleGrade(2)}
                disabled={isSubmitting}
              >
                <span className="font-semibold">Hard</span>
                <span className="text-xs opacity-70">Soon</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-16 flex flex-col gap-1 border-green-200 hover:bg-green-50 hover:text-green-700 hover:border-green-300"
                onClick={() => handleGrade(3)}
                disabled={isSubmitting}
              >
                <span className="font-semibold">Good</span>
                <span className="text-xs opacity-70">Later</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-16 flex flex-col gap-1 border-blue-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
                onClick={() => handleGrade(4)}
                disabled={isSubmitting}
              >
                <span className="font-semibold">Easy</span>
                <span className="text-xs opacity-70">Much Later</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
