import express , { Request, Response } from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import config from './services/config';
import routes from './routes';

dotenv.config();


// start app?
const app = express();
app.use(express.json());


// routes
app.use('/api', routes);

// start server
const start = async () => {
  // connect database 
  mongoose.connect(process.env.MONGODB_URI as string)
    .then(() => {console.log('MongoDB connected successfully'); })
    .catch((err: Error) => { console.error('MongoDB connection error: ', err); });

  
  try {
    // run reminder

    // parse application/json, verify callback came from facebook? do we need

    // set template engine in express

    // serving static file in express

    // respond with index file when a GET request is made to the homepage? do we need?

    // listen to port 

    app.listen(config.port, () => {
      console.log(`The app is listening on port ${config.port}`);
      if (config.apiUrl && config.verifyToken) {
        console.log(
          "Access the chat at https://www.facebook.com/messages/t/677353672132415\n"+
          "Is this the first time running?\n" +
          "Make sure to set the Messenger profile and webhook by visiting:\n" +
          config.appUrl +
          "/profile?mode=all&verify_token=" +
          config.verifyToken + "\n" + 
          "Make sure to set the persistent menu by visiting: \n" +
          config.appUrl +
          "/profile/persistent-menu"
        );
      }
    })

  } catch (error) {
    console.error('Error when start app');
    process.exit(1);
  }
}

start();

