/** 练习题 payload（存于 exercises.payload JSON 字段） */
export type ExercisePayload =
  | {
      kind: 'choice';
      question: string;
      options: string[];
      answerIndex: number;
      /** 播放音频的文本（听力题 / 词汇发音） */
      audioText?: string;
      /** true = 只播音频不显示题目文本（听力题） */
      audioOnly?: boolean;
    }
  | { kind: 'dictation'; audioText: string; answer: string; hint?: string }
  | { kind: 'fill'; question: string; answer: string; hint?: string }
  | { kind: 'speaking'; targetText: string; translation: string };

export interface PublicUser {
  id: number;
  email: string;
  nickname: string;
  nativeLang: string;
  xp: number;
  level: number;
  levelProgress: number;
  streak: number;
  createdAt: string;
}

export interface RecItem {
  key: string;
  kind: 'review' | 'continue' | 'weak' | 'explore';
  title: string;
  description: string;
  href: string;
  languageCode?: string;
  languageFlag?: string;
}
