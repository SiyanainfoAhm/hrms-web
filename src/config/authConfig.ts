export type AuthMethodFlags = {
  emailPassword: boolean;
  emailOtp: boolean;
  phoneOtp: boolean;
  google: boolean;
  facebook: boolean;
  forgotPassword: boolean;
  resetPassword: boolean;
};

export type AuthEndpoints = {
  baseUrl?: string;
  login: string;
  signup: string;
  sendEmailOtp: string;
  verifyEmailOtp: string;
  sendPhoneOtp: string;
  verifyPhoneOtp: string;
  forgotPassword: string;
  resetPassword: string;
  logout: string;
  me: string;
  oauthCallback?: string;
};

export type AuthConfig = {
  methods: AuthMethodFlags;
  endpoints: AuthEndpoints;
};

export const authConfig: AuthConfig = {
  methods: {
    emailPassword: true,
    emailOtp: false,
    phoneOtp: false,
    google: true,
    facebook: false,
    forgotPassword: true,
    resetPassword: true
  },
  endpoints: {
    baseUrl: process.env.NEXT_PUBLIC_AUTH_BASE_URL,
    login: "/auth/login",
    signup: "/auth/signup",
    sendEmailOtp: "/auth/otp/email/send",
    verifyEmailOtp: "/auth/otp/email/verify",
    sendPhoneOtp: "/auth/otp/phone/send",
    verifyPhoneOtp: "/auth/otp/phone/verify",
    forgotPassword: "/auth/password/forgot",
    resetPassword: "/auth/password/reset",
    logout: "/auth/logout",
    me: "/auth/me",
    oauthCallback: "/auth/oauth/callback"
  }
};

