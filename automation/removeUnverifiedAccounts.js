import cron from 'node-cron';
import {User} from '../models/userModel.js';

export const removeUnverifiedAccounts = () =>{
    // cron.schedule('*/20 * * * * *', async () => {}) // 20 sec

    const cronJob = cron.schedule('*/30 * * * *', async () => { // 30mintues
        const thirtyMinutesAgo = new Date(Date.now() - 30*60*1000);
        const usersToDelete = await User.deleteMany({
            accountVerified:false,
            createdAt: {$lt: thirtyMinutesAgo},
        });
    }); 
}