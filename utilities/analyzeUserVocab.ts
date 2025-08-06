import { UserVocab } from "../models/UserVocab";

async function analyzeUserVocab(userId: string, wordList: string[]|null): Promise<string> {
    let result = '';
    if (!wordList) {
        return result;
    }
    try {
        const response = await UserVocab.find({
            userId,
            $or: [
                {word: { $in: wordList}},
                {note: { $in: wordList}}
            ]
        });
        console.log('Result found ', response);

        let known = [];
        let introduced = []

        for (const item of response) {
            if(item.status === 'known') {
                known.push(item.word);
            }
            if(item.status === 'introduced') {
                introduced.push(item.word);
            }
        }

        const knownString = known.length > 0 ? known.join(',') : 'none';
        const introducedString = introduced.length > 0 ? introduced.join(',') : 'none';

        result = `
        Known words: ${knownString}
        Introduced words: ${introducedString}
        `
        
    } catch(error) {
        console.error('Error while analyzing userVocab');
    }

    return result;
}

export { analyzeUserVocab};