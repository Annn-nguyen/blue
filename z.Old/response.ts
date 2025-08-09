import i18n from "../i18n.config";

type QuickReply = {
  title: string;
  payload: string;
};

type Button = {
  type: string;
  title: string;
  payload?: string;
  url?: string;
  messenger_extensions?: boolean;
};

export default class Response {
  static genQuickReply(text: string, quickReplies: QuickReply[]) {
    const response = {
      text: text,
      quick_replies: [] as any[]
    };

    for (const quickReply of quickReplies) {
      response.quick_replies.push({
        content_type: "text",
        title: quickReply.title,
        payload: quickReply.payload
      });
    }

    return response;
  }

  static genGenericTemplate(
    image_url: string,
    title: string,
    subtitle: string,
    buttons: Button[]
  ) {
    const response = {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [
            {
              title: title,
              subtitle: subtitle,
              image_url: image_url,
              buttons: buttons
            }
          ]
        }
      }
    };
    return response;
  }

  static genRecurringNotificationsTemplate(
    image_url: string,
    title: string,
    notification_messages_frequency: string,
    payload: string
  ) {
    const response = {
      attachment: {
        type: "template",
        payload: {
          template_type: "notification_messages",
          title: title,
          image_url: image_url,
          notification_messages_frequency: notification_messages_frequency,
          payload: payload
        }
      }
    };
    return response;
  }

  static genImageTemplate(
    image_url: string,
    title: string,
    subtitle: string = ""
  ) {
    const response = {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [
            {
              title: title,
              subtitle: subtitle,
              image_url: image_url
            }
          ]
        }
      }
    };

    return response;
  }

  static genButtonTemplate(title: string, buttons: Button[]) {
    const response = {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: title,
          buttons: buttons
        }
      }
    };

    return response;
  }

  static genText(text: string) {
    const response = {
      text: text
    };

    return response;
  }

  static genTextWithPersona(text: string, persona_id: string) {
    const response = {
      text: text,
      persona_id: persona_id
    };

    return response;
  }

  static genPostbackButton(title: string, payload: string) {
    const response = {
      type: "postback",
      title: title,
      payload: payload
    };

    return response;
  }

  static genWebUrlButton(title: string, url: string) {
    const response = {
      type: "web_url",
      title: title,
      url: url,
      messenger_extensions: true
    };

    return response;
  }
}