import  { User , IUser}  from "../models/User";
import config from "./config";
import dotenv from "dotenv";
import GraphApi from "./graph-api";

export default class UserService {
    async findOrCreatUser(psid: string): Promise<IUser | null> {
        try {
            let user: any;

            // check exist any user in db with psid
            user = await User.findOne({psid: psid});

            if (user) {
                console.log('User found in db', user);
            } else {
                console.log('User not found in db, create new user');
                // get profile from messenger graph api
                const profile = await GraphApi.getUserProfile(psid);
                console.log('Profile get from messenger ', JSON.stringify(profile));

                // create new user 
                if (profile) {
                    user = await User.create({
                        psid: psid,
                        firstName : profile?.firstName,
                        locale : 'en_US'
                    });
                    console.log('New user created', user);
                } else {
                    console.error('Cant get user profile from messenger, creating a default user');
                    user = await User.create({
                        psid: psid,
                        firstName : 'Default User',
                        locale : 'en_US'
                    });
                    console.log('Default user created', user);
                }
            }
            return user;
        }
        catch (err) {
        console.error('Error in findOrCreateUser: ', err);
        return null;
        }
    } 
    
}