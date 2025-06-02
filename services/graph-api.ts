import config from "./config";
import fetch, { Response } from "node-fetch";
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
    } else {
      sent = true;
      console.log(`Message sent.`);
    };
    return { sent };
  }

  static async callMessengerProfileAPI(requestBody: object): Promise<void> {
    console.log(`Setting Messenger Profile for app ${config.appId}`);
    const url = new URL(`${config.apiUrl}/me/messenger_profile`);
    url.search = new URLSearchParams({
      access_token: config.pageAccesToken as string
    }).toString();
    let response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    if (response.ok) {
      console.log(`Request sent.`);
    } else {
      console.warn(
        `Unable to callMessengerProfileAPI: ${response.statusText}`,
        await response.json()
      );
    }
  }

  static async callSubscriptionsAPI(customFields?: string): Promise<void> {
    console.log(
      `Setting app ${config.appId} callback url to ${config.webhookUrl}`
    );

    let fields =
      "messages, messaging_postbacks, messaging_optins, " +
      "message_deliveries, messaging_referrals";

    if (customFields !== undefined) {
      fields = fields + ", " + customFields;
    }

    console.log({ fields });

    const url = new URL(`${config.apiUrl}/${config.appId}/subscriptions`);
    url.search = new URLSearchParams({
      access_token: `${config.appId}|${config.appSecret}`,
      object: "page",
      callback_url: config.webhookUrl,
      verify_token: config.verifyToken || "",
      fields: fields,
      include_values: "true"
    }).toString();
    let response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    if (response.ok) {
      console.log(`Request sent.`);
    } else {
      console.error(
        `Unable to callSubscriptionsAPI: ${response.statusText}`,
        await response.json()
      );
    }
  }

  static async callSubscribedApps(customFields?: string): Promise<void> {
    console.log(`Subscribing app ${config.appId} to page ${config.pageId}`);

    let fields =
      "messages, messaging_postbacks, messaging_optins, " +
      "message_deliveries, messaging_referrals";

    if (customFields !== undefined) {
      fields = fields + ", " + customFields;
    }

    console.log({ fields });

    const url = new URL(`${config.apiUrl}/${config.pageId}/subscribed_apps`);
    url.search = new URLSearchParams({
      access_token: config.pageAccesToken as string,
      subscribed_fields: fields
    }).toString();
    let response = await fetch(url.toString(), {
      method: "POST"
    });
    if (response.ok) {
      console.log(`Request sent.`);
    } else {
      console.error(
        `Unable to callSubscribedApps: ${response.statusText}`,
        await response.json()
      );
    }
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

  static async getPersonaAPI(): Promise<any> {
    console.log(`Fetching personas for app ${config.appId}`);

    const url = new URL(`${config.apiUrl}/me/personas`);
    url.search = new URLSearchParams({
      access_token: config.pageAccesToken as string
    }).toString();
    let response = await fetch(url.toString());
    if (response.ok) {
      let body = await response.json();
      return body.data;
    } else {
      console.warn(
        `Unable to fetch personas for ${config.appId}: ${response.statusText}`,
        await response.json()
      );
      return null;
    }
  }

  static async postPersonaAPI(name: string, profile_picture_url: string): Promise<string | undefined> {
    const requestBody = {
      name,
      profile_picture_url
    };
    console.log(`Creating a Persona for app ${config.appId}`);
    console.log({ requestBody });
    const url = new URL(`${config.apiUrl}/me/personas`);
    url.search = new URLSearchParams({
      access_token: config.pageAccesToken as string
    }).toString();
    let response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    if (response.ok) {
      console.log(`Request sent.`);
      let json = await response.json();
      return json.id;
    } else {
      console.error(
        `Unable to postPersonaAPI: ${response.statusText}`,
        await response.json()
      );
    }
  }

  static async callNLPConfigsAPI(): Promise<void> {
    console.log(`Enable Built-in NLP for Page ${config.pageId}`);

    const url = new URL(`${config.apiUrl}/me/nlp_configs`);
    url.search = new URLSearchParams({
      access_token: config.pageAccesToken as string,
      nlp_enabled: "true"
    }).toString();
    let response = await fetch(url.toString(), {
      method: "POST"
    });
    if (response.ok) {
      console.log(`Request sent.`);
    } else {
      console.error(`Unable to activate built-in NLP: ${response.statusText}`);
    }
  }

  static async reportLeadSubmittedEvent(psid: string): Promise<void> {
    const url = new URL(`${config.apiUrl}/${config.appId}/page_activities`);
    url.search = new URLSearchParams({
      access_token: config.pageAccesToken as string
    }).toString();
    const requestBody = {
      custom_events: [
        {
          _eventName: "lead_submitted"
        }
      ],
      advertiser_tracking_enabled: 1,
      application_tracking_enabled: 1,
      page_id: config.pageId,
      page_scoped_user_id: psid,
      logging_source: "messenger_bot",
      logging_target: "page"
    };
    console.warn(
      "Request to " + url + "\nWith body:\n" + JSON.stringify(requestBody)
    );
    try {
      let response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        console.warn(
          `Unable to call App Event API: ${response.statusText}`,
          await response.json()
        );
      }
    } catch (error) {
      console.error("Error while reporting lead submitted", error);
    }
  }
}