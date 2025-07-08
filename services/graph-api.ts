import config from "./config";
import fetch, { Response } from "node-fetch";
import { send } from "process";
import { URL, URLSearchParams } from "url";

type UserProfile = {
  firstName: string;
  lastName: string;
  gender: string;
  locale: string;
  timezone: number;
};

export default class GraphApi {
  static async callSendApi(requestBody: object): Promise<{sent: boolean}> {
    let sent = false;
    const url = new URL(`${config.apiUrl}/me/messages`);
    url.search = new URLSearchParams({
      access_token: config.pageAccesToken as string
    }).toString();
    console.warn("Request body is\n" + JSON.stringify(requestBody));
    let response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      console.warn(
        `Unable to call Send API: ${response.statusText}`,
        await response.json()
      );
      return { sent };
    } else {
      sent = true;
      console.log(`Message sent.`);
    };
    return { sent };
  }


  static async getUserProfile(senderIgsid: string): Promise<UserProfile | null> {
    const url = new URL(`${config.apiUrl}/${senderIgsid}`);
    url.search = new URLSearchParams({
      access_token: config.pageAccesToken as string,
      fields: "first_name, last_name, gender, locale, timezone"
    }).toString();
    let response = await fetch(url.toString());
    if (response.ok) {
      let userProfile = await response.json();
      console.log(`User profile for ${senderIgsid}:`, userProfile);
      return {
        firstName: userProfile.first_name,
        lastName: userProfile.last_name,
        gender: userProfile.gender,
        locale: userProfile.locale,
        timezone: userProfile.timezone
      };
    } else {
      console.warn(
        `Could not load profile for ${senderIgsid}: ${response.statusText}`,
        await response.json()
      );
      return null;
    }
  }

  static async sendTyping(senderpsid: string, type: string): Promise<void> {
    // construct the api url
    const url = new URL(`${config.apiUrl}/me/messages`);

    // add the query parameters
    url.search = new URLSearchParams({
      access_token: config.pageAccesToken as string
    }).toString();

    console.warn("Sending typing_on action to " + senderpsid);
    
    // construct the request body
    let senderAction = "typing_on";
    if (type !== "on" && type !== "off") {
      console.warn(`Invalid type: ${type}. Only 'typing_on' or 'typing_off' are allowed.`);
      return;
    } else if (type === "on") {
      senderAction = "typing_on";

    } else if (type === "off") {
      senderAction = "typing_off";
    };
    const requestBody = {
      recipient: { id: senderpsid },
      sender_action: "typing_on"
    };

    // send the request
    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify(requestBody)
      })

      if (! response.ok) {
        console.warn(
          `Unable to send typing on action: ${response.statusText}`, await response.json()
        );
      } else {
        console.log(`Typing on action sent to ${senderpsid}.`);
      }
    } catch (error) {
      console.error(`Error sending typing on action to ${senderpsid}:`, error);
    }
  }

  static async setPersistentMenu(menuData: object):Promise<any>{
    const url = new URL(`${config.apiUrl}/me/messenger_profile`);
    url.search = new URLSearchParams({
      access_token: config.pageAccesToken as string
    }).toString();

    // call api
    let response = await fetch(url.toString(), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(menuData)
    });

    if (!response.ok) {
      const error = await response.json();
      console.warn(`Unable to set persistent menu: ${response.statusText}`);
      throw new Error(error.error?.message || 'Failed to set persistent menu');
    }

    return response.json

  }

  static async setGetStarted():Promise<void>{
    const url = new URL(`${config.apiUrl}/me/messenger_profile`);
    url.search = new URLSearchParams({
      access_token: config.pageAccesToken as string
    }).toString();
    
    const body = {
      "get_started": {
          "payload": "GET_STARTED"
      }
    };

    let response = await fetch(url.toString(), {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)

    })

    if (!response.ok) {
      const error = await response.json();
      console.warn(`Unable to set persistent menu: ${response.statusText}`, error);
      throw new Error(error.error?.message || "Failed to set persistent menu");
    }
    return response.json();
  }
 
}