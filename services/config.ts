import dotenv from "dotenv";
dotenv.config();

const ENV_VARS = [
  "PAGE_ID",
  "APP_ID",
  "PAGE_ACCESS_TOKEN",
  "APP_SECRET",
  "VERIFY_TOKEN",
  "APP_URL",
  "SHOP_URL"
] as const;

const config = {
  // Messenger Platform API
  apiDomain: "https://graph.facebook.com",
  apiVersion: "v11.0",

  // Page and Application information
  pageId: process.env.PAGE_ID,
  appId: process.env.APP_ID,
  pageAccesToken: process.env.PAGE_ACCESS_TOKEN,
  appSecret: process.env.APP_SECRET,
  verifyToken: process.env.VERIFY_TOKEN,

  // URL of your app domain
  appUrl: process.env.APP_URL,

  // URL of your website
  shopUrl: process.env.SHOP_URL,

  // Preferred port (default to 3000)
  port: process.env.PORT || 3000,

  // Base URL for Messenger Platform API calls
  get apiUrl(): string {
    return `${this.apiDomain}/${this.apiVersion}`;
  },

  // URL of your webhook endpoint
  get webhookUrl(): string {
    return `${this.appUrl}/webhook`;
  },

  get whitelistedDomains(): (string | undefined)[] {
    return [this.appUrl, this.shopUrl];
  },

  checkEnvVariables: function (): void {
    ENV_VARS.forEach(function (key) {
      const value = process.env[key];
      if (!value) {
        console.warn("WARNING: Missing the environment variable " + key);
      } else {
        // Check that urls use https
        if (["APP_URL", "SHOP_URL"].includes(key)) {
          if (!value.startsWith("https://")) {
            console.warn(
              "WARNING: Your " + key + ' does not begin with "https://"'
            );
          }
        }
      }
    });
  }
};

export default config;