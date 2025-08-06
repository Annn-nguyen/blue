export interface UserProfile {
  firstName?: string;
  lastName?: string;
  locale?: string;
  timezone?: string;
  gender?: string;
}

export default class User {
  psid: string;
  firstName: string;
  lastName: string;
  locale: string;
  timezone: string;
  gender: string;

  constructor(psid: string) {
    this.psid = psid;
    this.firstName = "";
    this.lastName = "";
    this.locale = "en_US";
    this.timezone = "";
    this.gender = "neutral";
  }

  setProfile(profile: UserProfile): void {
    this.firstName = profile.firstName || "";
    this.lastName = profile.lastName || "";
    this.locale = profile.locale || "";
    this.timezone = profile.timezone || "";
    this.gender = profile.gender || "";
  }
}