import { UserVocab, IUserVocab } from "../models/UserVocab";

export default class UserVocabService {
    static async getUserVocab(userId: string): Promise<IUserVocab[]> {
        let result: IUserVocab[] = [];
        try {
            result = await UserVocab.find({
                userId
            });
        } catch(error) {
            console.error('Error while getting user vocabs');
        }
        return result;
    }
}