// ------------------------------------------------------------
//  Fill these two values from Supabase (see SETUP guide, Part 2):
//  Project Settings → API Keys → "Publishable key" (starts with sb_publishable_)
//  NEVER paste the Secret key (sb_secret_...) here.
//  The publishable key is meant to be public — security comes from the database rules.
// ------------------------------------------------------------
window.SANTA_CONFIG = {
  SUPABASE_URL: 'https://piqbgwjaaagmhtpcyiur.supabase.co',
  SUPABASE_KEY: 'sb_publishable_kN1GRBmpUt_RRDwyoIwVTQ_Y-tBzT_t',

  // Login options shown on the sign-in screen.
  // Phone/SMS login is OFF because SMS costs money. Email codes + Google are free.
  LOGIN_METHODS: { email: false, phone: false, google: true },

  DEFAULT_COUNTRY_CODE: '+91',
  OTP_LENGTH: 6           // must match Supabase → Auth → Email/Phone "OTP length"
};
