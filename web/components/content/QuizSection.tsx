'use client';

import { usePlayer } from '@/components/player/PlayerContext';
import { QuizCard } from './QuizCard';

/** 把 QuizCard 接到当前播放器的 store 上，使「验证」能真正改变 3D 场景 */
export function QuizSection() {
  const { spec, store } = usePlayer();
  return <QuizCard quizzes={spec.quiz ?? []} store={store} />;
}
