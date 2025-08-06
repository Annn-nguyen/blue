import express, { Request, Response } from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";

import mongoose from "mongoose";
import dotenv from "dotenv";

import Receive from "../services/newReceive";
import GraphApi from "../services/graph-api";
import User from "../models/User";
import config from "../services/config";
import i18n from "../i18n.config";
import '../services/reminderCron';



dotenv.config();

mongoose.connect(process.env.MONGODB_URI as string)
  .then(() => { console.log("MongoDB connected successfully"); })
  .catch((err: Error) => { console.error("MongoDB connection error:", err); });

const app = express();

console.log('Tavily API Key:', process.env.TAVILY_API_KEY); // Debug

const users: { [key: string]: any } = {};

app.use(
  express.urlencoded({
    extended: true
  })
);

// Parse application/json. Verify that callback came from Facebook
app.use(express.json({ verify: verifyRequestSignature }));

// Serving static files in Express
app.use(express.static(path.join(path.resolve(), "public")));

// Set template engine in Express
app.set("view engine", "ejs");

// Respond with index file when a GET request is made to the homepage
app.get("/", (_req: Request, res: Response) => {
  res.render("index");
});

// Add support for GET requests to our webhook
app.get("/webhook", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  //Check if a token and mode is in the query string of the request
  if (mode && token) {
    if (mode === "subscribe" && token === config.verifyToken) {
      //response with the challenge token from the request
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      //respond with 403 if the tokens do not match
      res.sendStatus(403);
    }
  }
});


// Add persistent menu
app.get('/profile/persistent-menu', async (_req: Request, res: Response) => {
  
  const menuData = {
    persistent_menu: [
      {
        locale: 'default',
        composer_input_disabled: false,
        call_to_actions: [
          {
            type: 'postback',
            title: 'Remind Daily Practice',
            payload: "SET_DAILY_REMINDER"
          },
          {
            type: 'web_url',
            title: 'Privacy Policy',
            url: 'https://starpy.wordpress.com/2025/06/27/privacy-policy-for-blue-gentle-comet/',
            webview_height_ratio: 'full'
          }
        ]
      }
    ]
  };
  try {
    // set get started first
    const getStart = await GraphApi.setGetStarted();
    console.log('Set get started successfully');
    // set persistent menu 
    const result = await GraphApi.setPersistentMenu(menuData);
    res.json(result);
    console.log('Set persistent menu for messenger successfully');

  } catch (error: any) {
    res.status(500).json({error: error.message})
  }
}

)

// Add support for POST requests to our webhook
app.post("/webhook", (req: Request, res: Response) => {
  const body = req.body;

  console.log(`\u{1F7EA} Received webhook:`);
  console.dir(body, { depth: null });
  //check if this is an event from a page subscription
  if (body.object === "page") {
    res.status(200).send("EVENT_RECEIVED");

    //iterate over each entry (message)
    body.entry.forEach(async (entry: any) => {
      entry.messaging.forEach(async (webhookEvent: any) => {
        // discard uninteresting events
        if ("read" in webhookEvent) {
          console.log("Got a read event");
          return;
        } else if ("delivery" in webhookEvent) {
          console.log("Got a delivery event");
          return;
        } else if (webhookEvent.message && webhookEvent.message.is_echo) {
          console.log(
            "Got an echo of our send, mid = " + webhookEvent.message.mid
          );
          return;
        }
        // Get sender PSID, user referral and check if user is a guest from chatplugin
        const senderPsid = webhookEvent.sender.id;
        console.log("Sender PSID:", senderPsid);
        const user_ref = webhookEvent.sender.user_ref;
        const guestUser = isGuestUser(webhookEvent);

        if (senderPsid != null && senderPsid != undefined) {
          const existingUser = await User.findOne({ psid: senderPsid });
          if (existingUser == null) {
            // Handle for user not saved in DB
            // If user is not Guest, get profile from Graph API
            if (!guestUser) {
              console.log("User not found in DB, create a new one");
              // APP not verifed, so we cannot get user profile
              // GraphApi.getUserProfile(senderPsid)
              //   .then((userProfile: any) => {
              //     return User.create({
              //       psid: senderPsid,
              //       firstName: userProfile.firstName,
              //       locale: userProfile.locale,
              //     });
              //   })
              //   .then((createdUser: any) => {
              //     users[senderPsid] = createdUser;
              //     console.log("User profile created:", createdUser);
              //   })
              //   .catch((error: any) => {
              //     console.log(JSON.stringify(body));
              //     console.log("Profile is unavailable:", error);
              //   })
              //   .finally(() => {

              //     // This sample code uses en_US 100%
              //     i18n.setLocale("en_US");
              //     console.log(
              //       "New Profile PSID:",
              //       senderPsid,
              //       "with locale:",
              //       i18n.getLocale()
              //     );
              //     return receiveAndReturn(
              //       users[senderPsid],
              //       webhookEvent,
              //       false
              //     );
              //   });
              try {
                const createdUser = await User.create({
                  psid: senderPsid,
                  firstName: "",
                  locale: "en_US",
                });
                users[senderPsid] = createdUser;
                console.log("User profile created:", createdUser);
                return receiveAndReturn(
                  users[senderPsid],
                  webhookEvent,
                  false
                );
              } catch (error) {
                console.log("Error creating user:", error);
              }
            } else {
              setDefaultUser(senderPsid);
              return receiveAndReturn(users[senderPsid], webhookEvent, false);
            }
          } else {

            // If user already exists in DB, set locale? 
            users[senderPsid] = existingUser;
            console.log("User profile already exists:", existingUser);
            i18n.setLocale(users[senderPsid].locale);
            console.log(
              "Profile already exists PSID:",
              senderPsid,
              "with locale:",
              i18n.getLocale()
            );
            console.log("call receiveAndReturn");
            return receiveAndReturn(users[senderPsid], webhookEvent, false);
          }
        } else if (user_ref != null && user_ref != undefined) {
          setDefaultUser(user_ref);
          return receiveAndReturn(users[user_ref], webhookEvent, true);
        }
      });
    });
  } else {
    res.sendStatus(404);
  }
});

function setDefaultUser(id: string) {
  const user = User.create({
    messengerId: id,
  });
  users[id] = user;
  i18n.setLocale("en_US");
}

function isGuestUser(webhookEvent: any): boolean {
  let guestUser = false;
  if ("postback" in webhookEvent) {
    if ("referral" in webhookEvent.postback) {
      if ("is_guest_user" in webhookEvent.postback.referral) {
        guestUser = true;
      }
    }
  }
  return guestUser;
}

function receiveAndReturn(user: any, webhookEvent: any, isUserRef: boolean) {
  const receiveMessage = new Receive(user, webhookEvent, isUserRef);
  console.log("route to receive.js");
  return receiveMessage.handleMessage();
}


function verifyRequestSignature(req: Request, res: Response, buf: Buffer) {
  const signature = req.headers["x-hub-signature"] as string | undefined;

  if (!signature) {
    console.warn(`Couldn't find "x-hub-signature" in headers.`);
  } else {
    const elements = signature.split("=");
    const signatureHash = elements[1];
    if (!config.appSecret) {
      throw new Error("App secret is not defined in config.");
    };
    const expectedHash = crypto
      .createHmac("sha1", config.appSecret)
      .update(buf)
      .digest("hex");
    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

config.checkEnvVariables();

const listener = app.listen(config.port, () => {
  console.log(`The app is listening on port ${(listener.address() as any).port}`);
  if (config.appUrl && config.verifyToken) {
    console.log(
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

  if (config.pageId) {
    console.log("Test your app by messaging:");
    console.log(`https://m.me/${config.pageId}`);
  }
});