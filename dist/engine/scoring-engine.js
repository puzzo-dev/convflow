export function scoreAnswers(answers, rules) {
    let score = 0;
    for (const rule of rules) {
        const answer = answers[rule.answerKey];
        if (answer !== undefined && rule.values[answer] !== undefined) {
            score += rule.values[answer];
        }
    }
    return Math.max(0, score);
}
