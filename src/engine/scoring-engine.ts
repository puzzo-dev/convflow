import { AnswerMap, ScoringRule } from '../types';

export function scoreAnswers(answers: AnswerMap, rules: ScoringRule[]): number {
  let score = 0;
  for (const rule of rules) {
    const answer = answers[rule.answerKey];
    if (answer !== undefined && rule.values[answer] !== undefined) {
      score += rule.values[answer];
    }
  }
  return Math.max(0, score);
}
